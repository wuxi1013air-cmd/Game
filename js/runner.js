/**
 * 横版跑酷：↑ 跳、↓ 滑铲；趴下/起身速度由 SLIDE_ANIM_SPEED 控制。
 * 地刺 / 仙人掌：碰到即死。高墙仅上部实体；正面顶墙左推；洞下松铲起身判输。
 */

const STORAGE_KEY = "mini-arcade-runner-best";

const PLAYER_ANCHOR_X = 120;
const RUN_W = 30;
const RUN_H = 40;
const SLIDE_W = 38;
const SLIDE_H = 15;
const GRAVITY = 2200;
const JUMP_V = -620;
const SLIDE_MIN_MS = 420;
/** 越大趴下/起身越快 */
const SLIDE_ANIM_SPEED = 28;
/** 低于此视为「起身」，高墙洞内与实体重叠则判输 */
const WALL_CROUCH_MORPH = 0.88;
/** 顶高墙时向左推（px/s） */
const WALL_PUSH_SPEED = 260;
/** 脱离高墙后 playerShiftX 回正速率（px/s） */
const SHIFT_RECOVER_SPEED = 520;
const DEATH_LEFT_X = 14;

export function createRunner(canvas, { onScore, onGameOver, getBestEl, isActive }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = H - 52;
  const SKY_TOP = 0;

  let best = Number(localStorage.getItem(STORAGE_KEY)) || 0;
  let running = false;
  let raf = 0;
  let lastT = 0;

  let score = 0;
  let distance = 0;
  let gameSpeed = 280;
  const speedCap = 520;
  let speedGrow = 2.4;

  /** @type {{ type: 'spike' | 'cactus' | 'wall'; x: number }[]} */
  let obstacles = [];
  let spawnWait = 280;

  let py = GROUND_Y - RUN_H;
  let vy = 0;
  let slideMorph = 0;
  let sliding = false;
  let slideKeyHeld = false;
  let slideUntil = 0;
  /** 被墙向左推时的水平偏移（≤0） */
  let playerShiftX = 0;
  /** 连续帧：身在墙柱范围内、贴地、头顶未挡、保持趴低（洞下滑行） */
  let wallScrapeFrames = 0;

  function syncBest() {
    if (getBestEl) getBestEl.textContent = String(best);
  }

  function playerCenterX() {
    return PLAYER_ANCHOR_X + playerShiftX;
  }

  function playerHitbox() {
    const w = RUN_W + (SLIDE_W - RUN_W) * slideMorph;
    const h = RUN_H + (SLIDE_H - RUN_H) * slideMorph;
    const x = playerCenterX() - w / 2;
    const y = GROUND_Y - h;
    return { x, y, w, h };
  }

  function aabbOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /** 高墙仅上部为实体，底部留洞供滑铲 */
  function wallSolidBox(obs) {
    const bw = 44;
    const bh = 52;
    return { x: obs.x, y: GROUND_Y - 72, w: bw, h: bh };
  }

  function obstacleBox(obs) {
    switch (obs.type) {
      case "spike": {
        const w = 34;
        const h = 16;
        return { x: obs.x, y: GROUND_Y - h, w, h };
      }
      case "cactus": {
        const w = 24;
        const h = 48;
        return { x: obs.x + 2, y: GROUND_Y - h, w, h };
      }
      case "wall":
        return wallSolidBox(obs);
      default:
        return { x: obs.x, y: GROUND_Y, w: 0, h: 0 };
    }
  }

  function wallVisualBox(obs) {
    return { x: obs.x, y: GROUND_Y - 72, w: 44, h: 54 };
  }

  function wallSolidOverlapPlayer(p) {
    for (const obs of obstacles) {
      if (obs.type === "wall" && aabbOverlap(p, wallSolidBox(obs))) return true;
    }
    return false;
  }

  function rightmostObstacleEdge() {
    let m = 0;
    for (const o of obstacles) {
      const b = obstacleBox(o);
      m = Math.max(m, b.x + b.w);
    }
    return m;
  }

  function trySpawn(move) {
    spawnWait -= move;
    if (spawnWait > 0) return;
    if (rightmostObstacleEdge() > W - 100) {
      spawnWait = 50;
      return;
    }
    const roll = Math.random();
    let type;
    if (roll < 0.28) type = "spike";
    else if (roll < 0.62) type = "cactus";
    else type = "wall";

    obstacles.push({ type, x: W + 28 });
    spawnWait = 240 + Math.random() * 220;
  }

  function die() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (score > best) {
      best = score;
      localStorage.setItem(STORAGE_KEY, String(best));
      syncBest();
    }
    onGameOver(score);
    draw();
  }

  /** 地刺、仙人掌：即死 */
  function lethalCollides() {
    const p = playerHitbox();
    for (const obs of obstacles) {
      if (obs.type === "wall") continue;
      if (aabbOverlap(p, obstacleBox(obs))) return true;
    }
    return false;
  }

  function update(dt) {
    const t = Math.min(dt, 0.05);

    const targetMorph = sliding ? 1 : 0;
    slideMorph += (targetMorph - slideMorph) * (1 - Math.exp(-SLIDE_ANIM_SPEED * t));
    if (Math.abs(slideMorph - targetMorph) < 0.01) slideMorph = targetMorph;

    const hNow = RUN_H + (SLIDE_H - RUN_H) * slideMorph;
    const onGround = py + hNow >= GROUND_Y - 0.5 && vy >= -2;

    if (onGround && sliding) {
      vy = 0;
      py = GROUND_Y - hNow;
    } else {
      vy += GRAVITY * t;
      py += vy * t;
      const hh = RUN_H + (SLIDE_H - RUN_H) * slideMorph;
      if (py + hh >= GROUND_Y) {
        py = GROUND_Y - hh;
        vy = 0;
      }
    }

    const move = gameSpeed * t;
    distance += move;
    score = Math.floor(distance / 12);

    for (const obs of obstacles) obs.x -= move;
    obstacles = obstacles.filter((o) => o.x > -120);

    gameSpeed = Math.min(speedCap, gameSpeed + speedGrow * t);

    trySpawn(move);

    const now = performance.now();
    if (!slideKeyHeld && sliding && now >= slideUntil) sliding = false;

    const pScrape = playerHitbox();
    let inWallColumn = false;
    for (const obs of obstacles) {
      if (obs.type !== "wall") continue;
      if (pScrape.x + pScrape.w > obs.x && pScrape.x < obs.x + 44) inWallColumn = true;
    }
    const clearUnderBeam = !wallSolidOverlapPlayer(pScrape);
    if (!onGround) {
      wallScrapeFrames = 0;
    } else if (
      inWallColumn &&
      clearUnderBeam &&
      slideMorph >= WALL_CROUCH_MORPH - 0.03
    ) {
      wallScrapeFrames = Math.min(90, wallScrapeFrames + 1);
    } else if (!inWallColumn) {
      wallScrapeFrames = 0;
    }

    const pWall = playerHitbox();
    if (wallSolidOverlapPlayer(pWall)) {
      const stoodUpUnderTunnel =
        wallScrapeFrames >= 2 &&
        !sliding &&
        slideMorph < WALL_CROUCH_MORPH;
      if (stoodUpUnderTunnel) {
        die();
        return;
      }
      playerShiftX -= WALL_PUSH_SPEED * t;
      const pa = playerHitbox();
      if (pa.x <= DEATH_LEFT_X) die();
    } else if (playerShiftX < 0) {
      const step = SHIFT_RECOVER_SPEED * t;
      playerShiftX = Math.min(0, playerShiftX + step);
    }

    if (lethalCollides()) die();
  }

  function drawObstacle(obs) {
    ctx.save();
    if (obs.type === "spike") {
      const b = obstacleBox(obs);
      ctx.fillStyle = "#64748b";
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      const n = 5;
      const step = b.w / n;
      for (let i = 0; i < n; i++) {
        const sx = b.x + i * step;
        ctx.beginPath();
        ctx.moveTo(sx, GROUND_Y);
        ctx.lineTo(sx + step / 2, b.y);
        ctx.lineTo(sx + step, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (obs.type === "cactus") {
      const b = obstacleBox(obs);
      ctx.fillStyle = "#15803d";
      ctx.strokeStyle = "#166534";
      fillRoundRect(ctx, b.x + 6, b.y + 8, 12, b.h - 8, 4);
      ctx.strokeRect(b.x + 6, b.y + 8, 12, b.h - 8);
      ctx.fillStyle = "#22c55e";
      fillRoundRect(ctx, b.x, b.y + 18, 8, 10, 3);
      fillRoundRect(ctx, b.x + b.w - 8, b.y + 22, 8, 12, 3);
      fillRoundRect(ctx, b.x + 2, b.y + 6, 8, 8, 2);
    } else {
      const b = wallVisualBox(obs);
      ctx.fillStyle = "#475569";
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 2;
      fillRoundRect(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
      ctx.fillRect(b.x + 4, b.y + 8, b.w - 8, 10);
    }
    ctx.restore();
  }

  function fillRoundRect(c, x, y, w, h, r) {
    if (typeof c.roundRect === "function") {
      c.beginPath();
      c.roundRect(x, y, w, h, r);
      c.fill();
    } else {
      c.fillRect(x, y, w, h);
    }
  }

  function drawPlayer() {
    const { x, y, w, h } = playerHitbox();
    const squash = slideMorph;
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.35)";
    ctx.shadowBlur = squash > 0.5 ? 6 : 10;
    ctx.fillStyle = "#f8fafc";
    fillRoundRect(ctx, x, y, w, h, Math.max(2, 5 - squash * 3));
    ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (squash > 0.15) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.2)";
      ctx.fillRect(x + w * 0.15, y + h * 0.55, w * 0.7, h * 0.25);
    }
    ctx.restore();
  }

  function draw() {
    const g = ctx.createLinearGradient(0, SKY_TOP, 0, GROUND_Y);
    g.addColorStop(0, "#0f172a");
    g.addColorStop(1, "#1e293b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(148, 163, 184, 0.15)";
    for (let i = 0; i < 8; i++) {
      const sx = ((i * 97 + (distance * 0.08) % 200) % (W + 40)) - 20;
      ctx.fillRect(sx, 20 + (i * 17) % 60, 2, 2);
    }

    ctx.strokeStyle = "rgba(110, 231, 183, 0.25)";
    ctx.lineWidth = 1;
    const gridOff = distance % 40;
    for (let gx = -gridOff; gx < W + 40; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, GROUND_Y + 4);
      ctx.lineTo(gx - 30, H);
      ctx.stroke();
    }

    ctx.fillStyle = "#334155";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = "#475569";
    ctx.fillRect(0, GROUND_Y, W, 3);

    for (const obs of obstacles) drawObstacle(obs);

    drawPlayer();
  }

  function loop(now) {
    if (!running) return;
    if (!lastT) lastT = now;
    const dt = (now - lastT) / 1000;
    lastT = now;
    update(dt);
    onScore(score);
    draw();
    raf = requestAnimationFrame(loop);
  }

  function jump() {
    if (!running) return;
    if (sliding) {
      sliding = false;
      slideKeyHeld = false;
    }
    const h = RUN_H + (SLIDE_H - RUN_H) * slideMorph;
    const onGround = Math.abs(py + h - GROUND_Y) < 5 && vy >= -120;
    if (onGround) vy = JUMP_V;
  }

  function slideStart() {
    if (!running) return;
    const h = RUN_H + (SLIDE_H - RUN_H) * slideMorph;
    const onGround = Math.abs(py + h - GROUND_Y) < 5 && vy >= -120;
    if (!onGround) return;
    sliding = true;
    slideUntil = performance.now() + SLIDE_MIN_MS;
    vy = 0;
    const hh = RUN_H + (SLIDE_H - RUN_H) * slideMorph;
    py = GROUND_Y - hh;
  }

  function reset() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastT = 0;
    score = 0;
    distance = 0;
    gameSpeed = 280;
    obstacles = [];
    spawnWait = 320;
    slideMorph = 0;
    sliding = false;
    slideKeyHeld = false;
    wallScrapeFrames = 0;
    playerShiftX = 0;
    vy = 0;
    py = GROUND_Y - RUN_H;
    syncBest();
    onScore(0);
    draw();
  }

  function start() {
    if (running) return;
    running = true;
    lastT = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function bindInput() {
    const active = () => typeof isActive === "function" && isActive();

    const onKeyDown = (e) => {
      if (!active() || !running) return;
      if (e.code === "ArrowUp") {
        if (e.repeat) return;
        e.preventDefault();
        e.stopPropagation();
        jump();
        return;
      }
      if (e.code === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        slideKeyHeld = true;
        slideStart();
      }
    };
    const onKeyUp = (e) => {
      if (!active()) return;
      if (e.code === "ArrowDown") {
        e.preventDefault();
        slideKeyHeld = false;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }

  const unbind = bindInput();
  reset();

  return {
    reset,
    start,
    stop,
    destroy() {
      stop();
      unbind();
    },
  };
}
