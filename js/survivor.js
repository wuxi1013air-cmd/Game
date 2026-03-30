/**
 * 类吸血鬼幸存者：三角主角、自动朝最近敌人射击、波次与卡牌强化。
 */

const PLAYER_MAX_HP = 120;
const PLAYER_SPEED = 4.15;
/** 碰撞半径（小于视觉三角） */
const PLAYER_HIT_R = 6.5;
/** 三角外形半径 */
const TRI_VISUAL_R = 9;
const BASE_FIRE_MS = 620;
const BULLET_SPEED = 8.5;
const BULLET_R = 2.4;
const BASE_BULLET_DMG = 11;
const INVULN_MS = 900;
const COUNTDOWN_MS = 5000;
const BOSS_WAVE = 12;

const LEVEL_MAX = 15;
const XP_DROP_CHANCE = 0.7;
const XP_PER_ORB = 14;
const PICKUP_RADIUS = 35;
const ORB_FLY_SPEED = 14;
const ORB_VISUAL_R = 3.5;
const BULLET_STAGGER_MS = 32;

function xpToNext(level) {
  if (level >= LEVEL_MAX) return 1;
  return Math.round(34 * Math.pow(1.24, level));
}

/** 普通怪碰撞半径（方形视觉略大于 r） */
const ENEMY_HIT_R = 6;
const BOSS_HIT_R = 30;
const BOSS_VISUAL_R = 36;

const BOSS_SPAWN_DELAY_MS = 900;
/** 每波首只怪出现前的延迟（进场时场上为空） */
const FIRST_SPAWN_DELAY_MS = 1000;

/** 同波内刷怪间隔：波次越高刷得越快（更压迫） */
function spawnIntervalForWave(w) {
  return Math.max(265, 740 - w * 42);
}

const CARD_DEFS = {
  multishot: { title: "弹道", desc: "弹道 +1" },
  bulletcount: { title: "子弹", desc: "子弹 +1" },
  damage: { title: "强装药", desc: "伤害 ×1.3" },
  pierce: { title: "穿透", desc: "穿透 +1" },
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

const GUN_LERP_SPEED = 0.18;
const HEAD_LERP_SPEED = 0.22;

function lerpAngle(from, to, t) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

/** 在 (0,0) 绘制，枪管沿 +X */
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

  /** @type {'combat' | 'cards'} */
  let phase = "combat";
  let wave = 1;
  let hp = PLAYER_MAX_HP;
  let invulnMs = 0;
  let px = W / 2;
  let py = H / 2;
  let headAngle = -Math.PI / 2;
  let gunAngle = -Math.PI / 2;
  let fireAcc = 0;

  let shotsPerVolley = 1;
  let bulletCount = 1;
  let damageMult = 1;
  let pierceExtra = 0;
  let atkSpdMult = 1;

  /** @type {{ x: number; y: number; vx: number; vy: number; dmg: number; pierceLeft: number }[]} */
  let bullets = [];
  /** @type {{ x: number; y: number; kind: 'square' | 'boss'; hp: number; maxHp: number; r: number; speed: number; contactDmg: number; rot: number }[]} */
  let enemies = [];
  let xpOrbs = [];
  let xp = 0;
  let level = 0;
  /** @type {{ spawnAt: number; ang: number; dmg: number }[]} */
  let pendingShots = [];
  let pendingLevelUps = 0;
  let waveClear = false;
  let waveCountdown = 0;

  const keys = { up: false, down: false, left: false, right: false };

  let waveSpawnTarget = 0;
  let waveSpawnedCount = 0;
  let spawnAccMs = 0;
  let bossSpawned = false;

  const margin = PLAYER_HIT_R + 6;

  function halt() {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function syncHud() {
    const remaining = (wave === BOSS_WAVE && bossSpawned)
      ? enemies.length
      : Math.max(0, waveSpawnTarget - waveSpawnedCount) + enemies.length;
    hooks.onHud({
      hp: Math.max(0, Math.ceil(hp)),
      maxHp: PLAYER_MAX_HP,
      wave,
      sub: level > 0 ? `Lv.${level}/${LEVEL_MAX}` : "",
      remaining,
    });
  }

  function reset() {
    halt();
    phase = "combat";
    wave = 1;
    hp = PLAYER_MAX_HP;
    invulnMs = 0;
    px = W / 2;
    py = H / 2;
    headAngle = -Math.PI / 2;
    gunAngle = -Math.PI / 2;
    fireAcc = 0;
    shotsPerVolley = 1;
    bulletCount = 1;
    damageMult = 1;
    pierceExtra = 0;
    atkSpdMult = 1;
    bullets = [];
    enemies = [];
    xpOrbs = [];
    xp = 0;
    level = 0;
    pendingShots = [];
    pendingLevelUps = 0;
    waveClear = false;
    waveCountdown = 0;
    waveSpawnTarget = 0;
    waveSpawnedCount = 0;
    spawnAccMs = 0;
    bossSpawned = false;
    syncHud();
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
    const spd = Math.min(1.8 + wave * 0.08, 2.8);
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
      hp: 10000,
      maxHp: 10000,
      r: BOSS_HIT_R,
      speed: 1.5,
      contactDmg: 50,
      rot: 0,
    });
  }

  /** 新一波：清空场上怪，从边缘按间隔陆续刷出（首只也有延迟） */
  function startWaveSpawning() {
    enemies = [];
    bullets = [];
    pendingShots = [];
    waveSpawnedCount = 0;
    spawnAccMs = 0;
    if (wave === BOSS_WAVE) {
      waveSpawnTarget = 0;
      bossSpawned = false;
    } else {
      waveSpawnTarget = 5 + wave * 3 + Math.floor((wave - 1) / 2);
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

  function spawnBullet(ang, dmg) {
    const muzzle = TRI_VISUAL_R * 0.35 + 10;
    bullets.push({
      x: px + Math.cos(ang) * muzzle,
      y: py + Math.sin(ang) * muzzle,
      vx: Math.cos(ang) * BULLET_SPEED,
      vy: Math.sin(ang) * BULLET_SPEED,
      dmg,
      pierceLeft: pierceExtra,
    });
  }

  function scheduleVolleyFrom(t0) {
    const dmg = BASE_BULLET_DMG * damageMult;
    let delay = 0;
    let lastT = t0;
    for (let s = 0; s < shotsPerVolley; s++) {
      const shotOff = (s - (shotsPerVolley - 1) / 2) * 0.09;
      const ang = gunAngle + shotOff;
      for (let b = 0; b < bulletCount; b++) {
        const spawnAt = t0 + delay;
        pendingShots.push({ spawnAt, ang, dmg });
        lastT = spawnAt;
        delay += BULLET_STAGGER_MS;
      }
    }
    return lastT + BULLET_STAGGER_MS;
  }

  function flushPendingShots(now) {
    pendingShots.sort((a, b) => a.spawnAt - b.spawnAt);
    while (pendingShots.length && pendingShots[0].spawnAt <= now) {
      const sh = pendingShots.shift();
      spawnBullet(sh.ang, sh.dmg);
    }
  }

  function applyCard(id) {
    switch (id) {
      case "multishot":
        shotsPerVolley += 1;
        break;
      case "bulletcount":
        bulletCount += 1;
        break;
      case "damage":
        damageMult *= 1.3;
        break;
      case "pierce":
        pierceExtra += 1;
        break;
      case "atkspd":
        atkSpdMult *= 1.5;
        break;
      default:
        break;
    }
  }

  function checkLevelUp() {
    while (level < LEVEL_MAX) {
      const need = xpToNext(level);
      if (xp < need) break;
      xp -= need;
      level++;
      pendingLevelUps++;
    }
    if (level >= LEVEL_MAX) xp = 0;
  }

  function showNextLevelCard() {
    pendingLevelUps--;
    phase = "cards";
    syncHud();
    const options = pickThreeCards();
    hooks.onOfferCards({ level, options });
  }

  function pickCard(cardId) {
    if (phase !== "cards") return;
    applyCard(cardId);
    hooks.onHideCards();
    if (pendingLevelUps > 0) {
      showNextLevelCard();
    } else {
      phase = "combat";
      lastT = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function waveFullyComplete() {
    if (wave === BOSS_WAVE) {
      return bossSpawned && !enemies.some(e => e.kind === "boss");
    }
    if (waveSpawnTarget <= 0) return false;
    return waveSpawnedCount >= waveSpawnTarget && enemies.length === 0;
  }

  function tick(now) {
    if (!running) return;
    const dt = Math.min(50, now - lastT);
    lastT = now;

    if (phase === "cards") {
      draw();
      raf = requestAnimationFrame(tick);
      return;
    }

    invulnMs = Math.max(0, invulnMs - dt);
    const step = dt / 16;

    let mx = 0;
    let my = 0;
    if (keys.left) mx -= 1;
    if (keys.right) mx += 1;
    if (keys.up) my -= 1;
    if (keys.down) my += 1;
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      px += (mx / len) * PLAYER_SPEED * step;
      py += (my / len) * PLAYER_SPEED * step;
      const moveAngle = Math.atan2(my, mx);
      headAngle = lerpAngle(headAngle, moveAngle, 1 - Math.pow(1 - HEAD_LERP_SPEED, step));
    }
    px = Math.max(margin, Math.min(W - margin, px));
    py = Math.max(margin, Math.min(H - margin, py));

    const nearest = nearestEnemy();
    const gunTarget = nearest ? Math.atan2(nearest.y - py, nearest.x - px) : headAngle;
    gunAngle = lerpAngle(gunAngle, gunTarget, 1 - Math.pow(1 - GUN_LERP_SPEED, step));

    if (waveClear) {
      waveCountdown -= dt;
      if (waveCountdown <= 0) {
        waveClear = false;
        wave++;
        startWaveSpawning();
      }
    }

    if (!waveClear) {
      if (wave === BOSS_WAVE) {
        spawnAccMs += dt;
        if (!bossSpawned) {
          if (spawnAccMs >= BOSS_SPAWN_DELAY_MS) {
            spawnBossAtEdge();
            bossSpawned = true;
            spawnAccMs = 0;
          }
        } else if (enemies.some(e => e.kind === "boss")) {
          const interval = spawnIntervalForWave(wave);
          let guard = 40;
          while (guard-- > 0) {
            const threshold = waveSpawnedCount === 0 ? FIRST_SPAWN_DELAY_MS : interval;
            if (spawnAccMs < threshold) break;
            spawnAccMs -= threshold;
            spawnSquareAtEdge();
            waveSpawnedCount++;
          }
        }
      } else {
        const interval = spawnIntervalForWave(wave);
        spawnAccMs += dt;
        let guard = 40;
        while (guard-- > 0 && waveSpawnedCount < waveSpawnTarget) {
          const threshold = waveSpawnedCount === 0 ? FIRST_SPAWN_DELAY_MS : interval;
          if (spawnAccMs < threshold) break;
          spawnAccMs -= threshold;
          spawnSquareAtEdge();
          waveSpawnedCount++;
        }
      }
    }

    flushPendingShots(now);

    fireAcc += dt;
    const fireInterval = BASE_FIRE_MS / atkSpdMult;
    let nextVolleyT = now;
    if (pendingShots.length) {
      let maxT = 0;
      for (const p of pendingShots) maxT = Math.max(maxT, p.spawnAt);
      nextVolleyT = maxT + BULLET_STAGGER_MS;
    }
    while (fireAcc >= fireInterval) {
      fireAcc -= fireInterval;
      nextVolleyT = scheduleVolleyFrom(nextVolleyT);
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
        if (e.hp <= 0) {
          if (e.kind !== "boss" && level < LEVEL_MAX && Math.random() < XP_DROP_CHANCE) {
            xpOrbs.push({ x: e.x, y: e.y, value: XP_PER_ORB, collecting: false, collected: false });
          }
          enemies.splice(hi, 1);
        }
      }
      if (b.pierceLeft < 0) bullets.splice(bi, 1);
    }

    for (const orb of xpOrbs) {
      if (orb.collected) continue;
      if (!orb.collecting && Math.hypot(orb.x - px, orb.y - py) < PICKUP_RADIUS) {
        orb.collecting = true;
      }
      if (orb.collecting) {
        const dx = px - orb.x;
        const dy = py - orb.y;
        const d = Math.hypot(dx, dy);
        if (d < 6 || d < 1e-6) {
          orb.collected = true;
          if (level < LEVEL_MAX) xp += orb.value;
        } else {
          const move = Math.min(d, ORB_FLY_SPEED * step);
          orb.x += (dx / d) * move;
          orb.y += (dy / d) * move;
          const pad = 6;
          orb.x = Math.max(pad, Math.min(W - pad, orb.x));
          orb.y = Math.max(pad, Math.min(H - pad, orb.y));
        }
      }
    }
    xpOrbs = xpOrbs.filter(o => !o.collected);

    checkLevelUp();
    if (pendingLevelUps > 0 && phase === "combat") {
      showNextLevelCard();
      draw();
      return;
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
      halt();
      hooks.onGameOver(wave);
      draw();
      return;
    }

    if (!waveClear && waveFullyComplete()) {
      if (wave === BOSS_WAVE) {
        halt();
        hooks.onVictory();
        draw();
        return;
      }
      waveClear = true;
      waveCountdown = COUNTDOWN_MS;
      for (const orb of xpOrbs) orb.collecting = true;
    }

    syncHud();
    draw();
    raf = requestAnimationFrame(tick);
  }

  function draw() {
    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(110, 231, 183, 0.12)";
    ctx.lineWidth = 1;
    const g = 64;
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
        const barW = BOSS_VISUAL_R * 2;
        const barH = 4;
        const barX = e.x - barW / 2;
        const barY = e.y + BOSS_VISUAL_R + 5;
        const hpRatio = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(barX, barY, barW * hpRatio, barH);
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(barX, barY, barW, barH);
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

    for (const orb of xpOrbs) {
      if (orb.collected) continue;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, ORB_VISUAL_R, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(34, 197, 94, 0.85)";
      ctx.fill();
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 1;
      ctx.stroke();
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

    const hurt = invulnMs > 0;
    const blink = hurt && Math.floor(invulnMs / 100) % 2 === 0;
    const triFill = blink ? "rgba(239, 68, 68, 0.8)" : "rgba(110, 231, 183, 0.88)";
    const triStroke = blink ? "#ef4444" : "#6ee7b7";
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(headAngle + Math.PI / 2);
    drawPolygon(ctx, 0, 0, TRI_VISUAL_R, 3, 0, triFill, triStroke);
    ctx.restore();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(gunAngle);
    if (typeof ctx.roundRect !== "function") {
      ctx.fillStyle = "#475569";
      ctx.fillRect(-2, -2.5, 13, 5);
      ctx.fillStyle = "#334155";
      ctx.fillRect(-5, -3, 4, 6);
    } else {
      drawPistolAtOrigin(ctx);
    }
    ctx.restore();

    const pBarW = TRI_VISUAL_R * 2.5;
    const pBarH = 3;
    const pBarX = px - pBarW / 2;
    const pBarY = py + TRI_VISUAL_R + 4;
    const pHpRatio = Math.max(0, hp / PLAYER_MAX_HP);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(pBarX, pBarY, pBarW, pBarH);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(pBarX, pBarY, pBarW * pHpRatio, pBarH);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(pBarX, pBarY, pBarW, pBarH);

    const xpBarH = 8;
    const xpBarY = H - xpBarH;
    const needXp = level < LEVEL_MAX ? xpToNext(level) : 1;
    const xpRatio = level >= LEVEL_MAX ? 1 : Math.min(1, xp / needXp);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, xpBarY, W, xpBarH);
    ctx.fillStyle = "#eab308";
    ctx.fillRect(0, xpBarY, W * xpRatio, xpBarH);

    if (waveClear && waveCountdown > 0) {
      const sec = Math.max(1, Math.ceil(waveCountdown / 1000));
      ctx.font = "bold 18px 'JetBrains Mono', ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 3;
      ctx.strokeText(`距离下一波还有：${sec}S`, 14, 14);
      ctx.fillStyle = "rgba(232, 236, 244, 0.9)";
      ctx.fillText(`距离下一波还有：${sec}S`, 14, 14);
    }
  }

  return {
    start() {
      reset();
      startWaveSpawning();
      running = true;
      lastT = performance.now();
      syncHud();
      raf = requestAnimationFrame(tick);
    },
    stop() {
      halt();
    },
    reset,
    setKey(dir, down) {
      if (dir in keys) keys[dir] = down;
    },
    pickCard,
  };
}
