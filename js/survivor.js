/**
 * 类吸血鬼幸存者：三角主角、自动朝最近敌人射击、波次与卡牌强化。
 */

const PLAYER_MAX_HP = 120;
const PLAYER_SPEED = 3.4;
const PLAYER_HIT_R = 13;
const BASE_FIRE_MS = 520;
const BULLET_SPEED = 10;
const BULLET_R = 3.5;
const BASE_BULLET_DMG = 11;
const INVULN_MS = 900;
const COUNTDOWN_MS = 3000;
const BOSS_WAVE = 12;

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
    ctx.lineWidth = 2;
    ctx.stroke();
  }
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
    syncHud("");
  }

  function spawnEnemiesForWave() {
    enemies = [];
    if (wave === BOSS_WAVE) {
      const side = Math.floor(Math.random() * 4);
      let bx = W / 2;
      let by = H / 2;
      const m = 80;
      if (side === 0) {
        bx = m + Math.random() * (W - 2 * m);
        by = m;
      } else if (side === 1) {
        bx = W - m;
        by = m + Math.random() * (H - 2 * m);
      } else if (side === 2) {
        bx = m + Math.random() * (W - 2 * m);
        by = H - m;
      } else {
        bx = m;
        by = m + Math.random() * (H - 2 * m);
      }
      enemies.push({
        x: bx,
        y: by,
        kind: "boss",
        hp: 520,
        maxHp: 520,
        r: 38,
        speed: 1.05,
        contactDmg: 50,
        rot: 0,
      });
      return;
    }
    const n = 4 + wave * 2;
    const dmg = normalEnemyContactDamage(wave);
    for (let i = 0; i < n; i++) {
      let ex;
      let ey;
      let tries = 0;
      do {
        ex = 40 + Math.random() * (W - 80);
        ey = 40 + Math.random() * (H - 80);
        tries++;
      } while (Math.hypot(ex - px, ey - py) < 100 && tries < 30);
      const spd = Math.min(2.1 + wave * 0.14, 4.2);
      enemies.push({
        x: ex,
        y: ey,
        kind: "square",
        hp: 18 + wave * 6,
        maxHp: 18 + wave * 6,
        r: 12,
        speed: spd,
        contactDmg: dmg,
        rot: Math.random() * Math.PI,
      });
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
    for (let p = 0; p < pistolCount; p++) {
      const pistolOff = (p - (pistolCount - 1) / 2) * 0.14;
      for (let s = 0; s < shotsPerVolley; s++) {
        const shotOff = (s - (shotsPerVolley - 1) / 2) * 0.09;
        const ang = aimAngle + pistolOff + shotOff;
        const dmg = BASE_BULLET_DMG * damageMult;
        bullets.push({
          x: px + Math.cos(ang) * 18,
          y: py + Math.sin(ang) * 18,
          vx: Math.cos(ang) * BULLET_SPEED,
          vy: Math.sin(ang) * BULLET_SPEED,
          dmg,
          pierceLeft: pierceExtra,
        });
        idx++;
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
    syncHud("下一波 3…");
    running = true;
    lastT = performance.now();
    raf = requestAnimationFrame(tick);
  }

  /**
   * 由 UI 在玩家选好卡后调用。
   * @param {string} cardId
   */
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
        spawnEnemiesForWave();
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
    px = Math.max(PLAYER_HIT_R + 8, Math.min(W - PLAYER_HIT_R - 8, px));
    py = Math.max(PLAYER_HIT_R + 8, Math.min(H - PLAYER_HIT_R - 8, py));

    const nearest = nearestEnemy();
    if (nearest) aimAngle = Math.atan2(nearest.y - py, nearest.x - px);

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
      e.rot += (dt / 400) * (e.kind === "boss" ? 0.4 : 1.2);
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

    if (enemies.length === 0) {
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
    ctx.strokeStyle = "rgba(110, 231, 183, 0.15)";
    ctx.lineWidth = 1;
    const g = 40;
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
          e.r,
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
        ctx.lineWidth = 2;
        const s = e.r * 1.35;
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
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(aimAngle + Math.PI / 2);
    const blink = invulnMs > 0 && Math.floor(invulnMs / 100) % 2 === 0;
    drawPolygon(
      ctx,
      0,
      0,
      PLAYER_HIT_R + 4,
      3,
      0,
      blink ? "rgba(110, 231, 183, 0.35)" : "rgba(110, 231, 183, 0.85)",
      "#6ee7b7",
    );
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
      spawnEnemiesForWave();
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
