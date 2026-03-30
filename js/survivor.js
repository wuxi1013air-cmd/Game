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
const BOSS_WAVE = 14;
/** 非 Boss 波：单波战斗时长上限，倒计时结束强制进下一波 */
const WAVE_COMBAT_DURATION_MS = 40000;
/** 提前清场后，剩余时间大于此值则缩短为该值（≤5s 时不再缩短） */
const WAVE_EARLY_CLEAR_SNAP_MS = 5000;
/** 左上角倒计时数字上限（与单波秒数一致） */
const WAVE_COUNTDOWN_UI_CAP_SEC = Math.ceil(WAVE_COMBAT_DURATION_MS / 1000);

const LEVEL_MAX = 18;
const XP_DROP_CHANCE = 0.85;
const XP_PER_ORB = 14;
/** 坦克首现波次（第 3、4 波为仅普通+子母插入波，无坦克） */
const TANK_FIRST_WAVE = 5;
const BOSS_TANK_CAP = 3;
const ENEMY_SEPARATION_GAP = 2.5;
/** 与普通兵重叠时，位移分给敌人的比例（其余回弹玩家，形成“推开”手感） */
const SQUARE_PUSH_ENEMY_SHARE = 0.84;
/** 玩家与敌人碰撞分离相对「外切」距离的倍数；1.2 表示重叠再低约 20% */
const PLAYER_ENEMY_SEP_MULT = 1.2;
/** 与画布网格线一致，用于「格」距离 */
const GRID = 64;
/** 普通兵、极速三角接触判伤：相对几何半径放宽约 30% */
const SQUARE_HIT_RANGE_MULT = 1.3;
/** 冲刺、母体等：判伤与外切一致（0% 额外重叠） */
const STRICT_HIT_RANGE_MULT = 1.0;
const SPEEDSTER_R = 7.2;
const SPEEDSTER_VISUAL_R = 10.5;
const SPEEDSTER_DETECT_GRIDS = 6;
const SPEEDSTER_CHARGE_MS = 1000;
const SPEEDSTER_DASH_GRIDS = 8;
/** 蓄力/冲刺锁定：玩家拉开超过此格数则打断蓄力回到追击 */
const SPEEDSTER_LOCK_BREAK_GRIDS = 6;
const SPEEDSTER_TRAIL_DOT_MS = 110;
/** 解体前子母母体移速相对普通正方形的比例 */
const CARRIER_PRE_SPLIT_SPEED_MULT = 0.88;
/** 子母剥离子体：短时冲刺倍率与时长 */
const CARRIER_CHILD_SPRINT_MULT = 1.5;
const CARRIER_CHILD_SPRINT_MS = 1200;
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
/** 子母：单块子体边长 = 普通正方形视觉边长；母体外包正方形边长 = 2×子体 */
const CARRIER_CELL = ENEMY_HIT_R * 1.45;
const CARRIER_R = CARRIER_CELL * Math.SQRT2 + 2;
const BOSS_HIT_R = 30;
const BOSS_VISUAL_R = 36;
/** 六边形坦克：相对原 Boss 1/4 尺寸的体积翻倍（半径 ×2，平面面积约 ×4） */
const TANK_HIT_R = BOSS_HIT_R / 2;
const TANK_VISUAL_R = BOSS_VISUAL_R / 2;
const TANK_DMG_FACTOR = 1 / 1.5;

const BOSS_SPAWN_DELAY_MS = 900;
/** 每波首只怪出现前的延迟（进场时场上为空） */
const FIRST_SPAWN_DELAY_MS = 1000;

/** 同波内刷怪间隔：波次越高刷得越快；5～Boss 波整体略放慢；Boss 波再略降；第 7 波起再略拉长间隔（总数不变） */
function spawnIntervalForWave(w) {
  let iv = Math.max(265, 740 - w * 42);
  if (w >= 5 && w <= BOSS_WAVE) iv = Math.round(iv * 1.1);
  if (w === BOSS_WAVE) iv = Math.round(iv * 1.22);
  if (w > 6 && w <= BOSS_WAVE) iv = Math.round(iv * 1.14);
  return iv;
}

/** 第 3、4 波：仅普通兵 + 1 只子母（无三角、无坦克） */
function isCarrierInsertWave(w) {
  return w === 3 || w === 4;
}

function speedsterSpawnTargetForWave(w) {
  if (w < 3 || w >= BOSS_WAVE) return 0;
  if (isCarrierInsertWave(w)) return 0;
  const wOld = w - 2;
  if (wOld <= 4) return 2;
  return Math.min(14, 2 + Math.floor((wOld - 4) * 1.5));
}

function carrierSpawnTargetForWave(w) {
  if (w < 3 || w >= BOSS_WAVE) return 0;
  if (isCarrierInsertWave(w)) return 1;
  const wOld = w - 2;
  if (wOld <= 4) return 1;
  return Math.min(10, 1 + (wOld - 4));
}

/**
 * 升级卡牌（CARD_DEFS 展示 / applyCard 数值）：
 * multishot +1 弹道（各弹道同时开火）；bulletcount +1 同弹道内子弹错峰；damage ×1.1；pierce +1；atkspd ×1.2；
 * heavyfire ×1.25 攻、移速×0.97；swiftwalk 移速×1.08；fullheal 回满血；
 * weakpoint 暴击 5%、暴伤×1.33（选项中最多一次）。多弹道夹角见 VOLLEY_SPREAD_RAD。
 */
const VOLLEY_SPREAD_RAD = 0.062;

const CARD_DEFS = {
  multishot: { title: "区域火力", desc: "弹道 +1" },
  bulletcount: { title: "火力翻倍", desc: "子弹数量 +1" },
  damage: { title: "精良火药", desc: "增加攻击力" },
  pierce: { title: "贯穿", desc: "贯穿 +1" },
  atkspd: { title: "快枪手", desc: "增加攻速" },
  heavyfire: {
    title: "重火力",
    desc: "增加更多的攻击力，略微降低移速。",
    note: "真是一把不错的枪，但是对我来说太重了些",
  },
  swiftwalk: {
    title: "健步如飞",
    desc: "增加8%移速",
    note: "好马配好鞍，好鞋配好人",
  },
  fullheal: {
    title: "生命恢复",
    desc: "回复至满血",
    note: "多抗一枪",
  },
  weakpoint: {
    title: "弱点打击",
    desc: "你现在可以暴击了，拥有5%的暴击概率",
  },
};

function normalEnemyContactDamage(wave) {
  return Math.min(5 + (wave - 1) * 2, 25);
}

/** 非 Boss 敌人移速全局略降（Boss 固定 1.5 不受影响） */
const ENEMY_MOVE_MULT = 0.93;

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
/** 极速三角追击/待机时朝向玩家的旋转（大于 HEAD_LERP 更快指向） */
const SPEEDSTER_CHASE_LERP_SPEED = 0.38;

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
  /** @type {{ x: number; y: number; kind: string; hp: number; maxHp: number; r: number; speed: number; contactDmg: number; rot: number; hitFlashMs: number; [k: string]: unknown }[]} */
  let enemies = [];
  let xpOrbs = [];
  let xp = 0;
  let level = 0;
  /** @type {{ spawnAt: number; ang: number; dmg: number }[]} */
  let pendingShots = [];
  let pendingLevelUps = 0;
  /** 非 Boss 波剩余战斗时间（ms），Boss 波为 0 */
  let waveCombatRemainMs = 0;

  const keys = { up: false, down: false, left: false, right: false };

  /** 左键激活：枪口朝画布内鼠标；右键或指针离开画布恢复自动索敌 */
  let manualGunAim = false;
  let manualAimX = 0;
  let manualAimY = 0;
  let pointerEventsBound = false;

  function updateManualAimFromClient(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    manualAimX = (clientX - r.left) * sx;
    manualAimY = (clientY - r.top) * sy;
  }

  function onCanvasMouseDown(e) {
    if (!running || phase !== "combat") return;
    if (e.button === 0) {
      manualGunAim = true;
      updateManualAimFromClient(e.clientX, e.clientY);
    }
  }

  function onCanvasMouseMove(e) {
    if (!running || phase !== "combat" || !manualGunAim) return;
    updateManualAimFromClient(e.clientX, e.clientY);
  }

  function onCanvasMouseLeave() {
    manualGunAim = false;
  }

  function onWindowMouseUp(e) {
    if (e.button === 0) manualGunAim = false;
  }

  function onCanvasContextMenu(e) {
    e.preventDefault();
  }

  function bindPointerEvents() {
    if (pointerEventsBound) return;
    canvas.addEventListener("mousedown", onCanvasMouseDown);
    canvas.addEventListener("mousemove", onCanvasMouseMove);
    canvas.addEventListener("mouseleave", onCanvasMouseLeave);
    canvas.addEventListener("contextmenu", onCanvasContextMenu);
    window.addEventListener("mouseup", onWindowMouseUp);
    pointerEventsBound = true;
  }

  function unbindPointerEvents() {
    if (!pointerEventsBound) return;
    canvas.removeEventListener("mousedown", onCanvasMouseDown);
    canvas.removeEventListener("mousemove", onCanvasMouseMove);
    canvas.removeEventListener("mouseleave", onCanvasMouseLeave);
    canvas.removeEventListener("contextmenu", onCanvasContextMenu);
    window.removeEventListener("mouseup", onWindowMouseUp);
    pointerEventsBound = false;
  }

  let waveSpawnTarget = 0;
  let waveSpawnedCount = 0;
  let spawnAccMs = 0;
  let bossSpawned = false;
  let tankWaveTarget = 0;
  let tankWaveSpawned = 0;
  let tankSpawnAccMs = 0;
  let bossTankSpawnAccMs = 0;
  let speedsterWaveTarget = 0;
  let speedsterWaveSpawned = 0;
  let speedsterSpawnAccMs = 0;
  let carrierWaveTarget = 0;
  let carrierWaveSpawned = 0;
  let carrierSpawnAccMs = 0;
  let bossSpeedsterAccMs = 0;
  let bossCarrierAccMs = 0;

  const margin = PLAYER_HIT_R + 6;

  function enemyMinionSpeed() {
    return Math.min(1.8 + wave * 0.08, 2.8) * ENEMY_MOVE_MULT;
  }

  function countEnemiesByKind(k) {
    return enemies.filter((e) => e.kind === k).length;
  }

  function halt() {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
    unbindPointerEvents();
  }

  function syncHud() {
    const remaining = (wave === BOSS_WAVE && bossSpawned)
      ? enemies.length
      : Math.max(0, waveSpawnTarget - waveSpawnedCount)
          + Math.max(0, tankWaveTarget - tankWaveSpawned)
          + Math.max(0, speedsterWaveTarget - speedsterWaveSpawned)
          + Math.max(0, carrierWaveTarget - carrierWaveSpawned)
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
    waveCombatRemainMs = 0;
    waveSpawnTarget = 0;
    waveSpawnedCount = 0;
    spawnAccMs = 0;
    bossSpawned = false;
    tankWaveTarget = 0;
    tankWaveSpawned = 0;
    tankSpawnAccMs = 0;
    bossTankSpawnAccMs = 0;
    speedsterWaveTarget = 0;
    speedsterWaveSpawned = 0;
    speedsterSpawnAccMs = 0;
    carrierWaveTarget = 0;
    carrierWaveSpawned = 0;
    carrierSpawnAccMs = 0;
    bossSpeedsterAccMs = 0;
    bossCarrierAccMs = 0;
    manualGunAim = false;
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

  /**
   * @param {number} x
   * @param {number} y
   * @param {{
   *   speedMult?: number;
   *   noXpDrop?: boolean;
   *   sprintMs?: number;
   *   sprintMult?: number;
   * } | undefined} [opts]
   */
  function spawnSquareEnemyAt(x, y, opts) {
    const dmg = normalEnemyContactDamage(wave);
    const baseSpd = enemyMinionSpeed();
    const spdMult = opts && typeof opts.speedMult === "number" ? opts.speedMult : 1;
    const sprintMs = opts && typeof opts.sprintMs === "number" ? opts.sprintMs : 0;
    const sprintMult =
      opts && typeof opts.sprintMult === "number" ? opts.sprintMult : 0;
    let spd = baseSpd * spdMult;
    let sprintRemainMs = 0;
    if (sprintMs > 0 && sprintMult > 0) {
      spd = baseSpd * sprintMult;
      sprintRemainMs = sprintMs;
    }
    const hpVal = Math.round(17 + wave * 6 + Math.floor(wave / 3) * 5);
    enemies.push({
      x,
      y,
      kind: "square",
      hp: hpVal,
      maxHp: hpVal,
      r: ENEMY_HIT_R,
      speed: spd,
      baseSpeed: baseSpd,
      contactDmg: dmg + 5,
      rot: Math.random() * Math.PI,
      hitFlashMs: 0,
      hitRangeMult: SQUARE_HIT_RANGE_MULT,
      noXpDrop: !!(opts && opts.noXpDrop),
      ...(sprintRemainMs > 0 ? { sprintRemainMs } : {}),
    });
  }

  function spawnSquareAtEdge() {
    const p = randomEdgePoint();
    spawnSquareEnemyAt(p.x, p.y);
  }

  function spawnSpeedsterAtEdge() {
    const p = randomEdgePoint();
    const dmg = normalEnemyContactDamage(wave) + 5;
    const minionSpd = enemyMinionSpeed();
    const spd = minionSpd * 1.5;
    const hpVal = Math.round((17 + wave * 6 + Math.floor(wave / 3) * 5) * 0.8);
    const dashSpd = minionSpd * 5;
    enemies.push({
      x: p.x,
      y: p.y,
      kind: "speedster",
      phase: "chase",
      hp: hpVal,
      maxHp: hpVal,
      r: SPEEDSTER_R,
      speed: spd,
      baseSpeed: spd,
      contactDmg: Math.round(dmg * 0.5),
      dashDmg: Math.round(dmg * 2),
      rot: Math.random() * Math.PI,
      hitFlashMs: 0,
      hitRangeMult: SQUARE_HIT_RANGE_MULT,
      chargeMs: 0,
      dashLeft: 0,
      dashDirX: 0,
      dashDirY: 0,
      dashSpeed: dashSpd,
      trail: /** @type {{ x: number; y: number; ms: number }[]} */ ([]),
    });
  }

  function spawnCarrierAtEdge() {
    const p = randomEdgePoint();
    const minionSpd = enemyMinionSpeed();
    const spd = minionSpd * CARRIER_PRE_SPLIT_SPEED_MULT;
    const dmg = normalEnemyContactDamage(wave) + 5;
    const baseHp = Math.round(17 + wave * 6 + Math.floor(wave / 3) * 5);
    const hpVal = Math.round(baseHp * 3.6 * 2);
    enemies.push({
      x: p.x,
      y: p.y,
      kind: "carrier",
      hp: hpVal,
      maxHp: hpVal,
      r: CARRIER_R,
      speed: spd,
      baseSpeed: minionSpd,
      contactDmg: Math.round(dmg * 1.5),
      rot: 0,
      hitFlashMs: 0,
      childrenReleased: false,
      hitRangeMult: STRICT_HIT_RANGE_MULT,
    });
  }

  function spawnTankAtEdge() {
    const p = randomEdgePoint();
    const dmg = normalEnemyContactDamage(wave);
    const minionSpd = enemyMinionSpeed();
    const spd = minionSpd * 0.9;
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
      hitRangeMult: STRICT_HIT_RANGE_MULT,
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
      hitRangeMult: STRICT_HIT_RANGE_MULT,
    });
  }

  /**
   * 新一波：重置刷怪计数；默认可清空场上怪。
   * @param {boolean} [preserveEnemies] 为 true 时保留现有敌人（倒计时结束叠加入场）；进 Boss 波应仍清空。
   */
  function startWaveSpawning(preserveEnemies = false) {
    if (!preserveEnemies) {
      enemies = [];
    }
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
      speedsterWaveTarget = 0;
      speedsterWaveSpawned = 0;
      speedsterSpawnAccMs = 0;
      carrierWaveTarget = 0;
      carrierWaveSpawned = 0;
      carrierSpawnAccMs = 0;
      bossSpeedsterAccMs = 0;
      bossCarrierAccMs = 0;
    } else {
      let sq = 5 + wave * 3 + Math.floor((wave - 1) / 2);
      if (isCarrierInsertWave(wave)) sq += 4;
      waveSpawnTarget = sq;
      tankWaveTarget =
        wave >= TANK_FIRST_WAVE
          ? Math.min(5, 3 + Math.floor((wave - TANK_FIRST_WAVE) / 2))
          : 0;
      speedsterWaveTarget = speedsterSpawnTargetForWave(wave);
      speedsterWaveSpawned = 0;
      speedsterSpawnAccMs = 0;
      carrierWaveTarget = carrierSpawnTargetForWave(wave);
      carrierWaveSpawned = 0;
      carrierSpawnAccMs = 0;
    }
    waveCombatRemainMs =
      wave === BOSS_WAVE ? 0 : WAVE_COMBAT_DURATION_MS;
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
    for (let s = 0; s < shotsPerVolley; s++) {
      const shotOff = (s - (shotsPerVolley - 1) / 2) * VOLLEY_SPREAD_RAD;
      const ang = gunAngle + shotOff;
      for (let b = 0; b < bulletCount; b++) {
        pendingShots.push({
          spawnAt: t0 + b * BULLET_STAGGER_MS,
          ang,
          dmg,
        });
      }
    }
    const volleySpan = Math.max(0, (bulletCount - 1) * BULLET_STAGGER_MS);
    return t0 + volleySpan + BULLET_STAGGER_MS;
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
        damageMult *= 1.1;
        break;
      case "pierce":
        pierceExtra += 1;
        break;
      case "atkspd":
        atkSpdMult *= 1.2;
        break;
      case "heavyfire":
        damageMult *= 1.25;
        moveSpeedMult *= 0.97;
        break;
      case "weakpoint":
        critChance = 0.05;
        break;
      case "swiftwalk":
        moveSpeedMult *= 1.08;
        break;
      case "fullheal":
        hp = PLAYER_MAX_HP;
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
      && speedsterWaveSpawned >= speedsterWaveTarget
      && carrierWaveSpawned >= carrierWaveTarget
      && enemies.length === 0
    );
  }

  function tick(now) {
    if (!running) return;
    const dt = Math.min(50, now - lastT);
    lastT = now;

    if (phase === "cards") {
      manualGunAim = false;
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
      let npx = px + (mx / len) * spd * step;
      let npy = py + (my / len) * spd * step;
      npx = Math.max(margin, Math.min(W - margin, npx));
      npy = Math.max(margin, Math.min(H - margin, npy));

      const solids = enemies.filter(
        (e) =>
          e.kind === "tank"
          || e.kind === "boss"
          || e.kind === "carrier"
          || (e.kind === "speedster" && e.phase === "dash"),
      );
      for (let pass = 0; pass < 4; pass++) {
        for (const e of solids) {
          let dx = npx - e.x;
          let dy = npy - e.y;
          let d = Math.hypot(dx, dy);
          const minD = (PLAYER_HIT_R + e.r) * PLAYER_ENEMY_SEP_MULT;
          if (d < minD) {
            if (d < 1e-5) {
              dx = 1;
              dy = 0;
              d = 1;
            }
            npx = e.x + (dx / d) * minD;
            npy = e.y + (dy / d) * minD;
          }
        }
        npx = Math.max(margin, Math.min(W - margin, npx));
        npy = Math.max(margin, Math.min(H - margin, npy));
      }

      for (let sqPass = 0; sqPass < 2; sqPass++) {
        for (const e of enemies) {
          const pushSquare =
            e.kind === "square"
            || (e.kind === "speedster" && e.phase !== "dash");
          if (!pushSquare) continue;
          let dx = e.x - npx;
          let dy = e.y - npy;
          let d = Math.hypot(dx, dy);
          const minD = (PLAYER_HIT_R + e.r) * PLAYER_ENEMY_SEP_MULT;
          if (d < minD) {
            if (d < 1e-5) {
              const ang = Math.random() * Math.PI * 2;
              dx = Math.cos(ang);
              dy = Math.sin(ang);
              d = 1;
            }
            const overlap = minD - d;
            const nx = dx / d;
            const ny = dy / d;
            const es = SQUARE_PUSH_ENEMY_SHARE;
            e.x += nx * overlap * es;
            e.y += ny * overlap * es;
            npx -= nx * overlap * (1 - es);
            npy -= ny * overlap * (1 - es);
          }
        }
        npx = Math.max(margin, Math.min(W - margin, npx));
        npy = Math.max(margin, Math.min(H - margin, npy));
      }

      px = npx;
      py = npy;
      const moveAngle = Math.atan2(my, mx);
      headAngle = lerpAngle(headAngle, moveAngle, 1 - Math.pow(1 - HEAD_LERP_SPEED, step));
    } else {
      px = Math.max(margin, Math.min(W - margin, px));
      py = Math.max(margin, Math.min(H - margin, py));
    }
    const nearest = nearestEnemy();
    const gunTarget = manualGunAim
      ? Math.atan2(manualAimY - py, manualAimX - px)
      : nearest
        ? Math.atan2(nearest.y - py, nearest.x - px)
        : headAngle;
    gunAngle = lerpAngle(gunAngle, gunTarget, 1 - Math.pow(1 - GUN_LERP_SPEED, step));

    {
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
          bossSpeedsterAccMs += dt;
          while (
            bossSpeedsterAccMs >= interval * 2.35
            && countEnemiesByKind("speedster") < 3
          ) {
            bossSpeedsterAccMs -= interval * 2.35;
            spawnSpeedsterAtEdge();
          }
          bossCarrierAccMs += dt;
          while (
            bossCarrierAccMs >= interval * 3.05
            && countEnemiesByKind("carrier") < 2
          ) {
            bossCarrierAccMs -= interval * 3.05;
            spawnCarrierAtEdge();
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
        const capSp = 4;
        if (speedsterWaveSpawned < speedsterWaveTarget) {
          speedsterSpawnAccMs += dt;
          let sg = 25;
          while (
            sg-- > 0
            && speedsterWaveSpawned < speedsterWaveTarget
            && countEnemiesByKind("speedster") < capSp
          ) {
            const sThr =
              speedsterWaveSpawned === 0 ? FIRST_SPAWN_DELAY_MS + 550 : interval * 1.06;
            if (speedsterSpawnAccMs < sThr) break;
            speedsterSpawnAccMs -= sThr;
            spawnSpeedsterAtEdge();
            speedsterWaveSpawned++;
          }
        }
        const capCar = 3;
        if (carrierWaveSpawned < carrierWaveTarget) {
          carrierSpawnAccMs += dt;
          let cg = 25;
          while (
            cg-- > 0
            && carrierWaveSpawned < carrierWaveTarget
            && countEnemiesByKind("carrier") < capCar
          ) {
            const cThr =
              carrierWaveSpawned === 0 ? FIRST_SPAWN_DELAY_MS + 700 : interval * 1.22;
            if (carrierSpawnAccMs < cThr) break;
            carrierSpawnAccMs -= cThr;
            spawnCarrierAtEdge();
            carrierWaveSpawned++;
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

    const detectR = SPEEDSTER_DETECT_GRIDS * GRID;
    const lockBreakR = SPEEDSTER_LOCK_BREAK_GRIDS * GRID;
    const dashLen = SPEEDSTER_DASH_GRIDS * GRID;
    for (const e of enemies) {
      if (
        e.kind === "square"
        && typeof e.sprintRemainMs === "number"
        && e.sprintRemainMs > 0
      ) {
        e.sprintRemainMs -= dt;
        if (e.sprintRemainMs <= 0) {
          e.speed = /** @type {number} */ (e.baseSpeed);
          delete e.sprintRemainMs;
        }
      }
      e.hitFlashMs = Math.max(0, e.hitFlashMs - dt);
      if (e.kind === "speedster") {
        const dashSpd = /** @type {number} */ (e.dashSpeed);
        const aimPlayerRot = () =>
          Math.atan2(py - e.y, px - e.x) + Math.PI / 2;
        if (e.phase === "charge") {
          const distP = Math.hypot(px - e.x, py - e.y);
          if (distP > lockBreakR) {
            e.phase = "chase";
            e.chargeMs = 0;
          }
        }
        if (e.phase === "charge") {
          e.rot = lerpAngle(
            e.rot,
            aimPlayerRot(),
            1 - Math.pow(1 - SPEEDSTER_CHASE_LERP_SPEED, step),
          );
          e.chargeMs = /** @type {number} */ (e.chargeMs) + dt;
          if (e.chargeMs >= SPEEDSTER_CHARGE_MS) {
            let ddx = px - e.x;
            let ddy = py - e.y;
            let dd = Math.hypot(ddx, ddy);
            if (dd < 1e-4) {
              ddx = 1;
              ddy = 0;
              dd = 1;
            }
            e.dashDirX = ddx / dd;
            e.dashDirY = ddy / dd;
            e.dashLeft = dashLen;
            e.phase = "dash";
            e.chargeMs = 0;
          }
        } else if (e.phase === "dash") {
          const dashAim =
            Math.atan2(
              /** @type {number} */ (e.dashDirY),
              /** @type {number} */ (e.dashDirX),
            ) + Math.PI / 2;
          e.rot = lerpAngle(
            e.rot,
            dashAim,
            1 - Math.pow(1 - SPEEDSTER_CHASE_LERP_SPEED, step),
          );
          const move = Math.min(
            dashSpd * step,
            /** @type {number} */ (e.dashLeft),
          );
          e.x += /** @type {number} */ (e.dashDirX) * move;
          e.y += /** @type {number} */ (e.dashDirY) * move;
          e.dashLeft = /** @type {number} */ (e.dashLeft) - move;
          const tr = /** @type {{ x: number; y: number; ms: number }[]} */ (e.trail);
          tr.push({ x: e.x, y: e.y, ms: SPEEDSTER_TRAIL_DOT_MS });
          if (tr.length > 28) tr.splice(0, tr.length - 28);
          if (/** @type {number} */ (e.dashLeft) <= 0) {
            e.phase = "chase";
          }
        } else {
          e.rot = lerpAngle(
            e.rot,
            aimPlayerRot(),
            1 - Math.pow(1 - SPEEDSTER_CHASE_LERP_SPEED, step),
          );
          const dch = Math.hypot(px - e.x, py - e.y);
          if (dch <= detectR) {
            e.phase = "charge";
            e.chargeMs = 0;
          } else {
            const dx = px - e.x;
            const dy = py - e.y;
            const d = dch || 1;
            e.x += (dx / d) * e.speed * step;
            e.y += (dy / d) * e.speed * step;
          }
        }
        const trAll = /** @type {{ x: number; y: number; ms: number }[]} */ (e.trail);
        for (const dot of trAll) dot.ms -= dt;
        while (trAll.length && trAll[0].ms <= 0) trAll.shift();
      } else if (e.kind === "carrier") {
        if (!e.childrenReleased && e.hp <= e.maxHp * 0.5) {
          e.childrenReleased = true;
          const L = CARRIER_CELL;
          const half = L / 2;
          const corners = [
            [-half, -half],
            [half, -half],
            [-half, half],
            [half, half],
          ];
          const m = enemyMinionSpeed();
          e.speed = m;
          e.baseSpeed = m;
          for (const [lx, ly] of corners) {
            const wx =
              e.x + Math.cos(e.rot) * lx - Math.sin(e.rot) * ly;
            const wy =
              e.y + Math.sin(e.rot) * lx + Math.cos(e.rot) * ly;
            spawnSquareEnemyAt(wx, wy, {
              noXpDrop: true,
              sprintMs: CARRIER_CHILD_SPRINT_MS,
              sprintMult: CARRIER_CHILD_SPRINT_MULT,
            });
          }
        }
        e.rot = lerpAngle(
          e.rot,
          Math.atan2(py - e.y, px - e.x) + Math.PI / 2,
          1 - Math.pow(1 - 0.14, step),
        );
        const dx = px - e.x;
        const dy = py - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.x += (dx / d) * e.speed * step;
        e.y += (dy / d) * e.speed * step;
      } else {
        const dx = px - e.x;
        const dy = py - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.x += (dx / d) * e.speed * step;
        e.y += (dy / d) * e.speed * step;
        e.rot += (dt / 400) * (e.kind === "boss" ? 0.35 : e.kind === "tank" ? 0.65 : 1.1);
      }
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
          if (e.kind !== "boss" && level < LEVEL_MAX && !e.noXpDrop) {
            if (e.kind === "tank") {
              xpOrbs.push({
                x: e.x,
                y: e.y,
                value: XP_PER_ORB * 2,
                kind: "blue",
                collecting: false,
                collected: false,
              });
            } else if (e.kind === "carrier") {
              xpOrbs.push({
                x: e.x,
                y: e.y,
                value: XP_PER_ORB * 2,
                kind: "blue",
                collecting: false,
                collected: false,
              });
            } else if (e.kind === "speedster") {
              if (Math.random() < 0.8) {
                xpOrbs.push({
                  x: e.x,
                  y: e.y,
                  value: XP_PER_ORB,
                  kind: "green",
                  collecting: false,
                  collected: false,
                });
              }
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
        const baseR = PLAYER_HIT_R + e.r;
        let mult =
          e.hitRangeMult !== undefined
            ? /** @type {number} */ (e.hitRangeMult)
            : e.kind === "square"
              ? SQUARE_HIT_RANGE_MULT
              : STRICT_HIT_RANGE_MULT;
        let dmg = e.contactDmg;
        if (e.kind === "speedster" && e.phase === "dash") {
          mult = STRICT_HIT_RANGE_MULT;
          dmg = /** @type {number} */ (e.dashDmg);
        }
        if (Math.hypot(px - e.x, py - e.y) < baseR * mult) {
          hp -= dmg;
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

    if (waveFullyComplete() && wave === BOSS_WAVE) {
      halt();
      hooks.onVictory();
      draw();
      return;
    }

    if (wave !== BOSS_WAVE && waveCombatRemainMs > 0) {
      if (
        waveFullyComplete()
        && waveCombatRemainMs > WAVE_EARLY_CLEAR_SNAP_MS
      ) {
        waveCombatRemainMs = WAVE_EARLY_CLEAR_SNAP_MS;
      } else {
        waveCombatRemainMs -= dt;
      }
      if (waveCombatRemainMs <= 0) {
        waveCombatRemainMs = 0;
        wave++;
        const keepOld = wave !== BOSS_WAVE;
        startWaveSpawning(keepOld);
        for (const orb of xpOrbs) orb.collecting = true;
      }
    }

    if (waveFullyComplete() && wave !== BOSS_WAVE) {
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
      if (e.kind === "speedster" && e.trail && /** @type {{ms:number}[]} */ (e.trail).length) {
        for (const dot of /** @type {{ x: number; y: number; ms: number }[]} */ (e.trail)) {
          const a = Math.max(0, dot.ms / SPEEDSTER_TRAIL_DOT_MS) * 0.42;
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(250, 204, 21, ${a})`;
          ctx.fill();
        }
      }
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
      } else if (e.kind === "speedster") {
        const hit = e.hitFlashMs > 0;
        if (e.phase === "charge") {
          const pulse = 0.38 + 0.32 * Math.sin(performance.now() / 70);
          ctx.save();
          ctx.globalAlpha = pulse;
          drawPolygon(
            ctx,
            e.x,
            e.y,
            SPEEDSTER_VISUAL_R + 5,
            3,
            e.rot,
            "rgba(255,255,255,0.22)",
            "rgba(255,255,255,0.55)",
          );
          ctx.restore();
        }
        drawPolygon(
          ctx,
          e.x,
          e.y,
          SPEEDSTER_VISUAL_R,
          3,
          e.rot,
          hit ? "rgba(253, 224, 71, 0.82)" : "rgba(234, 179, 8, 0.78)",
          hit ? "#fde047" : "#ca8a04",
        );
      } else if (e.kind === "carrier") {
        const hit = e.hitFlashMs > 0;
        const L = CARRIER_CELL;
        const motherFill = hit ? "rgba(88, 28, 135, 0.88)" : "rgba(55, 15, 85, 0.92)";
        const motherStroke = hit ? "#e9d5ff" : "#a78bfa";
        const childFill = hit ? "rgba(167, 139, 250, 0.72)" : "rgba(139, 92, 246, 0.62)";
        const childStroke = hit ? "#c4b5fd" : "#8b5cf6";
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot);
        if (!e.childrenReleased) {
          ctx.fillStyle = motherFill;
          ctx.strokeStyle = motherStroke;
          ctx.lineWidth = 2.2;
          ctx.fillRect(-L, -L, 2 * L, 2 * L);
          ctx.strokeRect(-L, -L, 2 * L, 2 * L);
          const quads = [
            [-L, -L],
            [0, -L],
            [-L, 0],
            [0, 0],
          ];
          for (const [qx, qy] of quads) {
            ctx.fillStyle = childFill;
            ctx.strokeStyle = childStroke;
            ctx.lineWidth = 1.2;
            ctx.fillRect(qx, qy, L, L);
            ctx.strokeRect(qx, qy, L, L);
          }
          ctx.strokeStyle = motherStroke;
          ctx.lineWidth = 2.2;
          ctx.strokeRect(-L, -L, 2 * L, 2 * L);
        } else {
          ctx.fillStyle = motherFill;
          ctx.strokeStyle = motherStroke;
          ctx.lineWidth = 2.2;
          ctx.fillRect(-L, -L, 2 * L, 2 * L);
          ctx.strokeRect(-L, -L, 2 * L, 2 * L);
        }
        ctx.restore();
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

    if (wave !== BOSS_WAVE && waveCombatRemainMs > 0) {
      const rawSec = Math.max(0, Math.ceil(waveCombatRemainMs / 1000));
      const sec = Math.min(WAVE_COUNTDOWN_UI_CAP_SEC, rawSec);
      const msg = `下波倒计时：${sec}S`;
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
      bindPointerEvents();
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
