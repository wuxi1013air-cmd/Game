/**
 * 类吸血鬼幸存者：三角主角、自动朝最近敌人射击、波次与卡牌强化。
 */

const PLAYER_MAX_HP = 120;
const PLAYER_SPEED = 3.85;
/** 碰撞半径（小于视觉三角） */
const PLAYER_HIT_R = 6.5;
/** 三角外形半径 */
const TRI_VISUAL_R = 9;
const BASE_FIRE_MS = 520;
const BULLET_SPEED = 10;
const BULLET_R = 2.4;
const BASE_BULLET_DMG = 11;
const INVULN_MS = 900;
const COUNTDOWN_MS = 5000;
const BOSS_WAVE = 12;

/** 普通怪碰撞半径（方形视觉略大于 r） */
const ENEMY_HIT_R = 6;
const BOSS_HIT_R = 20;
const BOSS_VISUAL_R = 24;

const BOSS_SPAWN_DELAY_MS = 750;

/** 同波内刷怪间隔：波次越高刷得越快（更压迫） */
function spawnIntervalForWave(w) {
  return Math.max(265, 740 - w * 42);
}

const CARD_DEFS = {
  multishot: { title: "弹幕", desc: "每次开火子弹数量 +1" },
  damage: { title: "强装药", desc: "子弹伤害 ×1.3" },
  pierce: { title: "穿透", desc: "子弹穿透 +1" },
  pistol: { title: "双持", desc: "增加一把手枪" },
  atkspd: { title: "急速", desc: "攻速 ×1.5" },
};

function normalEnemyContactDamage(wave) {
  return Math.min(5 + (wave - 1) * 2, 25);
}

function pickThreeCards() {
  const ids = Object.keys(CARD_DEFS);
  const shuffled = [...ids].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map((id) => ({
    id,
    title: CARD_DEFS[id].title,
    desc: CARD_DEFS[id].desc,
  }));
}

function drawPolygon(ctx, x, y, r, sides, rotation, fill, stroke) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2 - Math.PI / 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/** 在 (0,0) 绘制，枪管沿 +X，稍后会用 rotate(aimAngle) 对准目标 */
function drawPistolAtOrigin(ctx) {
  ctx.fillStyle = "#475569";
  ctx.beginPath();
  ctx.roundRect(-2, -2.5, 13, 5, 1.5);
  ctx.fill();
  ctx.fillStyle = "#334155";
  ctx.fillRect(-5, -3, 4, 6);
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.arc(11, 0, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   onHud: (s: { hp: number; maxHp: number; wave: number; sub: string }) => void;
 *   onOfferCards: (o: { wave: number; options: { id: string; title: string; desc: string }[] }) => void;
 *   onHideCards: () => void;
 *   onGameOver: (wave: number) => void;
 *   onVictory: () => void;
 * }} hooks
 */
export function createSurvivor(canvas, hooks) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  let running = false;
  let raf = 0;
  let lastT = 0;

  /** @type {'combat' | 'cards' | 'countdown'} */
  let phase = "combat";
  let wave = 1;
  let hp = PLAYER_MAX_HP;
  let invulnMs = 0;
  let px = W / 2;
  let py = H / 2;
  let aimAngle = -Math.PI / 2;
  let fireAcc = 0;

  let pistolCount = 1;
  let shotsPerVolley = 1;
  let damageMult = 1;
  let pierceExtra = 0;
  let atkSpdMult = 1;

  /** @type {{ x: number; y: number; vx: number; vy: number; dmg: number; pierceLeft: number }[]} */
  let bullets = [];
  /** @type {{ x: number; y: number; kind: 'square' | 'boss'; hp: number; maxHp: number; r: number; speed: number; contactDmg: number; rot: number }[]} */
  let enemies = [];

  const keys = { up: false, down: false, left: false, right: false };
  let countdownMs = 0;

  let waveSpawnTarget = 0;
  let waveSpawnedCount = 0;
  let spawnAccMs = 0;

  const margin = PLAYER_HIT_R + 6;

  function syncHud(sub = "") {
    hooks.onHud({
      hp: Math.max(0, Math.ceil(hp)),
      maxHp: PLAYER_MAX_HP,
      wave,
      sub,
    });
  }

  function reset() {
    phase = "combat";
    wave = 1;
    hp = PLAYER_MAX_HP;
    invulnMs = 0;
    px = W / 2;
    py = H / 2;
    aimAngle = -Math.PI / 2;
    fireAcc = 0;
    pistolCount = 1;
    shotsPerVolley = 1;
    damageMult = 1;
    pierceExtra = 0;
    atkSpdMult = 1;
    bullets = [];
    enemies = [];
    countdownMs = 0;
    waveSpawnTarget = 0;
    waveSpawnedCount = 0;
    spawnAccMs = 0;
    syncHud("");
  }

  function randomEdgePoint() {
    const pad = 8;
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) {
      return { x: pad + Math.random() * (W - 2 * pad), y: pad };
    }
    if (edge === 1) {
      return { x: W - pad, y: pad + Math.random() * (H - 2 * pad) };
    }
    if (edge === 2) {
      return { x: pad + Math.random() * (W - 2 * pad), y: H - pad };
    }
    return { x: pad, y: pad + Math.random() * (H - 2 * pad) };
  }

  function spawnSquareAtEdge() {
    const p = randomEdgePoint();
    const dmg = normalEnemyContactDamage(wave);
    const spd = Math.min(1.38 + wave * 0.065, 2.35);
    const hpVal = Math.round(17 + wave * 6 + Math.floor(wave / 3) * 5);
    enemies.push({
      x: p.x,
      y: p.y,
      kind: "square",
      hp: hpVal,
      maxHp: hpVal,
      r: ENEMY_HIT_R,
      speed: spd,
      contactDmg: dmg,
      rot: Math.random() * Math.PI,
    });
  }

  function spawnBossAtEdge() {
    const p = randomEdgePoint();
    enemies.push({
      x: p.x,
      y: p.y,
      kind: "boss",
      hp: 480,
      maxHp: 480,
      r: BOSS_HIT_R,
      speed: 0.78,
      contactDmg: 50,
      rot: 0,
    });
  }

  /** 新一波：清空场上怪，从边缘陆续刷出 */
  function startWaveSpawning() {
    enemies = [];
    waveSpawnedCount = 0;
    spawnAccMs = 0;
    if (wave === BOSS_WAVE) {
      waveSpawnTarget = 1;
    } else {
      waveSpawnTarget = 5 + wave * 3 + Math.floor((wave - 1) / 2);
      spawnSquareAtEdge();
      waveSpawnedCount = 1;
    }
  }

  function nearestEnemy() {
    let best = null;
    let bestD = Infinity;
    for (const e of enemies) {
      const d = Math.hypot(e.x - px, e.y - py);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  function fireVolley() {
    const target = nearestEnemy();
    if (target) aimAngle = Math.atan2(target.y - py, target.x - px);
    const muzzle = TRI_VISUAL_R * 0.35 + 10;
    for (let p = 0; p < pistolCount; p++) {
      const pistolOff = (p - (pistolCount - 1) / 2) * 0.14;
      for (let s = 0; s < shotsPerVolley; s++) {
        const shotOff = (s - (shotsPerVolley - 1) / 2) * 0.09;
        const ang = aimAngle + pistolOff + shotOff;
        const dmg = BASE_BULLET_DMG * damageMult;
        bullets.push({
          x: px + Math.cos(ang) * muzzle,
          y: py + Math.sin(ang) * muzzle,
          vx: Math.cos(ang) * BULLET_SPEED,
          vy: Math.sin(ang) * BULLET_SPEED,
          dmg,
          pierceLeft: pierceExtra,
        });
      }
    }
  }

  function applyCard(id) {
    switch (id) {
      case "multishot":
        shotsPerVolley += 1;
        break;
      case "damage":
        damageMult *= 1.3;
        break;
      case "pierce":
        pierceExtra += 1;
        break;
      case "pistol":
        pistolCount += 1;
        break;
      case "atkspd":
        atkSpdMult *= 1.5;
        break;
      default:
        break;
    }
  }

  function beginCardPhase() {
    phase = "cards";
    running = false;
    cancelAnimationFrame(raf);
    syncHud("选择强化卡牌");
    const options = pickThreeCards();
    hooks.onOfferCards({ wave, options });
  }

  function afterCardPicked() {
    hooks.onHideCards();
    phase = "countdown";
    countdownMs = COUNTDOWN_MS;
    syncHud(`下一波 ${Math.ceil(COUNTDOWN_MS / 1000)} 秒后开始…`);
    running = true;
    lastT = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function pickCard(cardId) {
    if (phase !== "cards") return;
    applyCard(cardId);
    wave += 1;
    afterCardPicked();
  }

  function resolveWaveClear() {
    if (wave === BOSS_WAVE) {
      running = false;
      cancelAnimationFrame(raf);
      hooks.onVictory();
      return;
    }
    beginCardPhase();
  }

  function waveFullyComplete() {
    return waveSpawnedCount >= waveSpawnTarget && enemies.length === 0;
  }

  function tick(now) {
    if (!running) return;
    const dt = Math.min(50, now - lastT);
    lastT = now;

    if (phase === "countdown") {
      countdownMs -= dt;
      const sec = Math.ceil(countdownMs / 1000);
      syncHud(sec > 0 ? `下一波 ${sec}…` : "");
      if (countdownMs <= 0) {
        phase = "combat";
        startWaveSpawning();
        syncHud("");
      }
      draw();
      raf = requestAnimationFrame(tick);
      return;
    }

    if (phase !== "combat") {
      raf = requestAnimationFrame(tick);
      return;
    }

    invulnMs = Math.max(0, invulnMs - dt);

    let mx = 0;
    let my = 0;
    if (keys.left) mx -= 1;
    if (keys.right) mx += 1;
    if (keys.up) my -= 1;
    if (keys.down) my += 1;
    const step = dt / 16;
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      px += (mx / len) * PLAYER_SPEED * step;
      py += (my / len) * PLAYER_SPEED * step;
    }
    px = Math.max(margin, Math.min(W - margin, px));
    py = Math.max(margin, Math.min(H - margin, py));

    const nearest = nearestEnemy();
    if (nearest) aimAngle = Math.atan2(nearest.y - py, nearest.x - px);

    if (wave === BOSS_WAVE) {
      spawnAccMs += dt;
      if (waveSpawnedCount < waveSpawnTarget && spawnAccMs >= BOSS_SPAWN_DELAY_MS) {
        spawnBossAtEdge();
        waveSpawnedCount = 1;
      }
    } else {
      const interval = spawnIntervalForWave(wave);
      spawnAccMs += dt;
      while (waveSpawnedCount < waveSpawnTarget && spawnAccMs >= interval) {
        spawnAccMs -= interval;
        spawnSquareAtEdge();
        waveSpawnedCount++;
      }
    }

    fireAcc += dt;
    const fireInterval = BASE_FIRE_MS / atkSpdMult;
    while (fireAcc >= fireInterval) {
      fireAcc -= fireInterval;
      fireVolley();
    }

    for (const b of bullets) {
      b.x += b.vx * (dt / 16);
      b.y += b.vy * (dt / 16);
    }
    bullets = bullets.filter(
      (b) => b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20,
    );

    for (const e of enemies) {
      const dx = px - e.x;
      const dy = py - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * step;
      e.y += (dy / d) * e.speed * step;
      e.rot += (dt / 400) * (e.kind === "boss" ? 0.35 : 1.1);
    }

    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      while (b.pierceLeft >= 0) {
        const hi = enemies.findIndex(
          (e) => Math.hypot(b.x - e.x, b.y - e.y) < e.r + BULLET_R,
        );
        if (hi === -1) break;
        const e = enemies[hi];
        e.hp -= b.dmg;
        b.pierceLeft -= 1;
        if (e.hp <= 0) enemies.splice(hi, 1);
      }
      if (b.pierceLeft < 0) bullets.splice(bi, 1);
    }

    if (invulnMs <= 0) {
      for (const e of enemies) {
        if (Math.hypot(px - e.x, py - e.y) < PLAYER_HIT_R + e.r) {
          hp -= e.contactDmg;
          invulnMs = INVULN_MS;
          break;
        }
      }
    }

    if (hp <= 0) {
      running = false;
      cancelAnimationFrame(raf);
      hooks.onGameOver(wave);
      draw();
      return;
    }

    if (waveFullyComplete()) {
      resolveWaveClear();
      draw();
      return;
    }

    syncHud("");
    draw();
    raf = requestAnimationFrame(tick);
  }

  function draw() {
    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(110, 231, 183, 0.12)";
    ctx.lineWidth = 1;
    const g = 48;
    for (let x = 0; x <= W; x += g) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += g) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    for (const e of enemies) {
      if (e.kind === "boss") {
        drawPolygon(
          ctx,
          e.x,
          e.y,
          BOSS_VISUAL_R,
          5,
          e.rot,
          "rgba(244, 114, 182, 0.35)",
          "#f472b6",
        );
      } else {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot);
        ctx.fillStyle = "rgba(167, 139, 250, 0.45)";
        ctx.strokeStyle = "#a78bfa";
        ctx.lineWidth = 1.5;
        const s = e.r * 1.45;
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.strokeRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      }
    }

    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI * 2);
      ctx.fillStyle = "#fde68a";
      ctx.fill();
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const blink = invulnMs > 0 && Math.floor(invulnMs / 100) % 2 === 0;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(aimAngle + Math.PI / 2);
    drawPolygon(
      ctx,
      0,
      0,
      TRI_VISUAL_R,
      3,
      0,
      blink ? "rgba(110, 231, 183, 0.35)" : "rgba(110, 231, 183, 0.88)",
      "#6ee7b7",
    );
    ctx.restore();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(aimAngle);
    if (typeof ctx.roundRect !== "function") {
      ctx.fillStyle = "#475569";
      ctx.fillRect(-2, -2.5, 13, 5);
      ctx.fillStyle = "#334155";
      ctx.fillRect(-5, -3, 4, 6);
    } else {
      drawPistolAtOrigin(ctx);
    }
    ctx.restore();

    if (phase === "countdown") {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, W, H);
      const sec = Math.max(0, Math.ceil(countdownMs / 1000));
      ctx.font = "bold 64px 'JetBrains Mono', ui-monospace, monospace";
      ctx.fillStyle = "#e8ecf4";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(sec || 3), W / 2, H / 2);
    }
  }

  return {
    start() {
      if (running) return;
      reset();
      startWaveSpawning();
      running = true;
      lastT = performance.now();
      syncHud("");
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    reset,
    setKey(dir, down) {
      if (dir in keys) keys[dir] = down;
    },
    pickCard,
  };
}
