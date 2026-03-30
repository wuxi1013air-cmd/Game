/**
 * 类吸血鬼幸存者：三角主角、自动朝最近敌人射击、波次与卡牌强化。
 */

const PLAYER_MAX_HP = 120;
const PLAYER_SPEED = 4.15 * 0.94 * 0.95;
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
const XP_DROP_CHANCE = 0.85;
const XP_PER_ORB = 14;
const TANK_FIRST_WAVE = 3;
const BOSS_TANK_CAP = 3;
const ENEMY_SEPARATION_GAP = 2.5;
const PICKUP_RADIUS = 35;
const ORB_FLY_SPEED = 14;
const ORB_VISUAL_R = 3.5;
const BULLET_STAGGER_MS = 32;
const ENEMY_HIT_FLASH_MS = 140;
const CRIT_MULT = 1.33;

function xpToNext(level) {
  if (level >= LEVEL_MAX) return 1;
  return Math.round(34 * Math.pow(1.24, level)) * 2;
}

/** 普通怪碰撞半径（方形视觉略大于 r） */
const ENEMY_HIT_R = 6;
const BOSS_HIT_R = 30;
const BOSS_VISUAL_R = 36;
const TANK_HIT_R = BOSS_HIT_R / 4;
const TANK_VISUAL_R = BOSS_VISUAL_R / 4;
const TANK_DMG_FACTOR = 1 / 1.5;

const BOSS_SPAWN_DELAY_MS = 900;
/** 每波首只怪出现前的延迟（进场时场上为空） */
const FIRST_SPAWN_DELAY_MS = 1000;

/** 同波内刷怪间隔：波次越高刷得越快（更压迫） */
function spawnIntervalForWave(w) {
  return Math.max(265, 740 - w * 42);
}

/**
 * 升级卡牌（CARD_DEFS 展示 / applyCard 数值）：
 * multishot +1 扇面；bulletcount +1 每道子弹发数；damage ×1.15；pierce +1；
 * atkspd ×1.08；heavyfire ×1.15 伤害且移速×0.97；weakpoint 暴击率 5%、暴伤×1.33（仅可出现一次于选项中）。
 */
const CARD_DEFS = {
  multishot: { title: "区域火力", desc: "区域火力 +1" },
  bulletcount: { title: "火力翻倍", desc: "火力翻倍 +1" },
  damage: { title: "精良火药", desc: "增加攻击力" },
  pierce: { title: "贯穿", desc: "贯穿 +1" },
  atkspd: { title: "快枪手", desc: "增加攻速" },
  heavyfire: {
    title: "重火力",
    desc: "增加更多的攻击力，略微降低移速。",
    note: "真是一把不错的枪，但是对我来说太重了些",
  },
  weakpoint: {
    title: "弱点打击",
    desc: "你现在可以暴击了，拥有5%的暴击概率",
  },
};

function normalEnemyContactDamage(wave) {
  return Math.min(5 + (wave - 1) * 2, 25);
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
  let moveSpeedMult = 1;
  let critChance = 0;
  let weakpointEverInOffer = false;
  let cardRerollsLeft = 3;

  /** @type {{ x: number; y: number; vx: number; vy: number; dmg: number; pierceLeft: number }[]} */
  let bullets = [];
  /** @type {{ x: number; y: number; kind: 'square' | 'boss' | 'tank'; hp: number; maxHp: number; r: number; speed: number; contactDmg: number; rot: number; hitFlashMs: number }[]} */
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
  let tankWaveTarget = 0;
  let tankWaveSpawned = 0;
  let tankSpawnAccMs = 0;
  let bossTankSpawnAccMs = 0;

  const margin = PLAYER_HIT_R + 6;

  function halt() {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function syncHud() {
    const remaining = (wave === BOSS_WAVE && bossSpawned)
      ? enemies.length
      : Math.max(0, waveSpawnTarget - waveSpawnedCount)
          + Math.max(0, tankWaveTarget - tankWaveSpawned)
          + enemies.length;
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
    moveSpeedMult = 1;
    critChance = 0;
    weakpointEverInOffer = false;
    cardRerollsLeft = 3;
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
    tankWaveTarget = 0;
    tankWaveSpawned = 0;
    tankSpawnAccMs = 0;
    bossTankSpawnAccMs = 0;
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
      hitFlashMs: 0,
    });
  }

  function spawnTankAtEdge() {
    const p = randomEdgePoint();
    const dmg = normalEnemyContactDamage(wave);
    const minionSpd = Math.min(1.8 + wave * 0.08, 2.8);
    const spd = minionSpd * 1.1;
    const minionHp = Math.round(17 + wave * 6 + Math.floor(wave / 3) * 5);
    const hpMult = 2 + Math.floor(Math.random() * 2);
    const hpVal = Math.round(minionHp * hpMult);
    enemies.push({
      x: p.x,
      y: p.y,
      kind: "tank",
      hp: hpVal,
      maxHp: hpVal,
      r: TANK_HIT_R,
      speed: spd,
      contactDmg: dmg,
      rot: Math.random() * Math.PI,
      hitFlashMs: 0,
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
      hitFlashMs: 0,
    });
  }

  /** 新一波：清空场上怪，从边缘按间隔陆续刷出（首只也有延迟） */
  function startWaveSpawning() {
    enemies = [];
    pendingShots = [];
    waveSpawnedCount = 0;
    spawnAccMs = 0;
    tankWaveSpawned = 0;
    tankSpawnAccMs = 0;
    bossTankSpawnAccMs = 0;
    if (wave === BOSS_WAVE) {
      waveSpawnTarget = 0;
      tankWaveTarget = 0;
      bossSpawned = false;
    } else {
      waveSpawnTarget = 5 + wave * 3 + Math.floor((wave - 1) / 2);
      tankWaveTarget =
        wave >= TANK_FIRST_WAVE
          ? Math.min(5, 3 + Math.floor((wave - TANK_FIRST_WAVE) / 2))
          : 0;
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
        damageMult *= 1.15;
        break;
      case "pierce":
        pierceExtra += 1;
        break;
      case "atkspd":
        atkSpdMult *= 1.08;
        break;
      case "heavyfire":
        damageMult *= 1.15;
        moveSpeedMult *= 0.97;
        break;
      case "weakpoint":
        critChance = 0.05;
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

  function pickThreeCardsInternal() {
    const pool = Object.keys(CARD_DEFS).filter(
      (id) => id !== "weakpoint" || !weakpointEverInOffer,
    );
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, 3);
    if (picked.includes("weakpoint")) weakpointEverInOffer = true;
    return picked.map((id) => {
      const def = CARD_DEFS[id];
      return {
        id,
        title: def.title,
        desc: def.desc,
        note: def.note ?? "",
      };
    });
  }

  function showNextLevelCard() {
    pendingLevelUps--;
    phase = "cards";
    syncHud();
    const options = pickThreeCardsInternal();
    hooks.onOfferCards({
      level,
      options,
      rerollsLeft: cardRerollsLeft,
      rerollsMax: 3,
    });
  }

  function rerollCardChoices() {
    if (phase !== "cards" || cardRerollsLeft <= 0) return;
    cardRerollsLeft--;
    const options = pickThreeCardsInternal();
    hooks.onOfferCards({
      level,
      options,
      rerollsLeft: cardRerollsLeft,
      rerollsMax: 3,
    });
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
    if (waveSpawnTarget <= 0 && tankWaveTarget <= 0) return false;
    return (
      waveSpawnedCount >= waveSpawnTarget
      && tankWaveSpawned >= tankWaveTarget
      && enemies.length === 0
    );
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
      const spd = PLAYER_SPEED * moveSpeedMult;
      px += (mx / len) * spd * step;
      py += (my / len) * spd * step;
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
          bossTankSpawnAccMs += dt;
          const tankIv = interval * 1.35;
          let tGuard = 8;
          while (
            tGuard-- > 0
            && bossTankSpawnAccMs >= tankIv
            && enemies.filter((e) => e.kind === "tank").length < BOSS_TANK_CAP
          ) {
            bossTankSpawnAccMs -= tankIv;
            spawnTankAtEdge();
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
        if (wave >= TANK_FIRST_WAVE && tankWaveSpawned < tankWaveTarget) {
          tankSpawnAccMs += dt;
          let tg = 40;
          while (tg-- > 0 && tankWaveSpawned < tankWaveTarget) {
            const tThr =
              tankWaveSpawned === 0 ? FIRST_SPAWN_DELAY_MS + 400 : interval * 1.12;
            if (tankSpawnAccMs < tThr) break;
            tankSpawnAccMs -= tThr;
            spawnTankAtEdge();
            tankWaveSpawned++;
          }
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
      e.rot += (dt / 400) * (e.kind === "boss" ? 0.35 : e.kind === "tank" ? 0.65 : 1.1);
      e.hitFlashMs = Math.max(0, e.hitFlashMs - dt);
    }

    const edgePad = 4;
    for (let i = 0; i < enemies.length; i++) {
      for (let j = i + 1; j < enemies.length; j++) {
        const a = enemies[i];
        const b = enemies[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const minD = a.r + b.r + ENEMY_SEPARATION_GAP;
        if (d < 1e-4) {
          const ang = Math.random() * Math.PI * 2;
          dx = Math.cos(ang);
          dy = Math.sin(ang);
          d = 1;
        }
        if (d < minD) {
          const push = (minD - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
    for (const e of enemies) {
      e.x = Math.max(e.r + edgePad, Math.min(W - e.r - edgePad, e.x));
      e.y = Math.max(e.r + edgePad, Math.min(H - e.r - edgePad, e.y));
    }

    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      while (b.pierceLeft >= 0) {
        const hi = enemies.findIndex(
          (e) => Math.hypot(b.x - e.x, b.y - e.y) < e.r + BULLET_R,
        );
        if (hi === -1) break;
        const e = enemies[hi];
        let hitDmg = b.dmg;
        if (e.kind === "tank") hitDmg *= TANK_DMG_FACTOR;
        if (critChance > 0 && Math.random() < critChance) hitDmg *= CRIT_MULT;
        e.hp -= hitDmg;
        e.hitFlashMs = ENEMY_HIT_FLASH_MS;
        b.pierceLeft -= 1;
        if (e.hp <= 0) {
          if (e.kind !== "boss" && level < LEVEL_MAX) {
            if (e.kind === "tank") {
              xpOrbs.push({
                x: e.x,
                y: e.y,
                value: XP_PER_ORB * 2,
                kind: "blue",
                collecting: false,
                collected: false,
              });
            } else if (Math.random() < XP_DROP_CHANCE) {
              xpOrbs.push({
                x: e.x,
                y: e.y,
                value: XP_PER_ORB,
                kind: "green",
                collecting: false,
                collected: false,
              });
            }
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
        const hit = e.hitFlashMs > 0;
        drawPolygon(
          ctx,
          e.x,
          e.y,
          BOSS_VISUAL_R,
          5,
          e.rot,
          hit ? "rgba(252, 165, 165, 0.5)" : "rgba(244, 114, 182, 0.35)",
          hit ? "#fca5a5" : "#f472b6",
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
      } else if (e.kind === "tank") {
        const hit = e.hitFlashMs > 0;
        drawPolygon(
          ctx,
          e.x,
          e.y,
          TANK_VISUAL_R,
          6,
          e.rot,
          hit ? "rgba(147, 197, 253, 0.65)" : "rgba(59, 130, 246, 0.45)",
          hit ? "#93c5fd" : "#3b82f6",
        );
      } else {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot);
        const hit = e.hitFlashMs > 0;
        ctx.fillStyle = hit ? "rgba(252, 165, 165, 0.55)" : "rgba(167, 139, 250, 0.45)";
        ctx.strokeStyle = hit ? "#f87171" : "#a78bfa";
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
      const blue = orb.kind === "blue";
      ctx.fillStyle = blue ? "rgba(96, 165, 250, 0.9)" : "rgba(34, 197, 94, 0.85)";
      ctx.fill();
      ctx.strokeStyle = blue ? "#60a5fa" : "#4ade80";
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
      const msg = `距离下一波还有：${sec}S`;
      ctx.font = "bold 28px 'JetBrains Mono', ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 5;
      ctx.strokeText(msg, 14, 14);
      ctx.fillStyle = "rgba(232, 236, 244, 0.95)";
      ctx.fillText(msg, 14, 14);
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
    rerollCardChoices,
  };
}
