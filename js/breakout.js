const COLS = 10;
const GRID_ROWS = 7;
const PADDLE_W = 88;
const PADDLE_H = 10;
const BALL_R = 6;
const BRICK_H = 22;
const PADDLE_Y_OFF = 28;

/** 发球与竖直向上分量的速率（挡板水平，发球垂直于挡板即纯向上） */
const BALL_VY_UP = [4.2, 5.2];
const BALL_SPEED_CAP = 10.5;
/** 分裂出的两球速率（与竖直成 45° 向左右上） */
const SPLIT_SPEED = 5.4;
const POWERUP_SPAWN_CHANCE = 0.1;
const POWERUP_FALL_VY = 2.8;
const POWERUP_R = 11;
/** 场上小球数量上限 */
const MAX_BALLS = 20;

export function createBreakout(canvas, { onScore, onLives, onWin, onLose }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const brickW = (W - 20) / COLS;
  const brickTop = 44;
  const rowGap = 4;

  let paddleX = W / 2 - PADDLE_W / 2;
  /** @type {{ x: number; y: number; vx: number; vy: number }[]} */
  let balls = [];
  /** 未点击发球时，球贴在挡板上 */
  let launched = false;
  /** @type {{ x: number; y: number; vy: number; r: number }[]} */
  let powerUps = [];
  let bricks = [];
  let score = 0;
  let lives = 3;
  let running = false;
  let raf = 0;

  function randRange(a, b) {
    return a + Math.random() * (b - a);
  }

  function cellKey(r, c) {
    return `${r},${c}`;
  }

  function addBrickAt(list, r, c, indestructible, hue) {
    const hues = [330, 280, 220, 160, 110];
    list.push({
      x: 10 + c * brickW,
      y: brickTop + r * (BRICK_H + rowGap),
      w: brickW - 3,
      h: BRICK_H,
      alive: true,
      indestructible,
      hue: hue ?? hues[r % hues.length],
    });
  }

  /**
   * 随机布局：可破坏砖稀疏/随机填充 + 钢砖围墙（缺口仅在上边 / 下边 / 上下同时；
   * 缺口为连续随机宽度，且不在围墙矩形四角）+ 少量散落钢砖。
   */
  function buildBricks() {
    const list = [];
    const occupied = new Set();

    const encW = 3 + Math.floor(Math.random() * 3);
    const encH = 2 + Math.floor(Math.random() * 2);
    const margin = 1;
    const maxSc = COLS - encW - margin * 2;
    const maxSr = GRID_ROWS - encH - margin * 2;
    if (maxSc >= 0 && maxSr >= 0) {
      const sc = margin + Math.floor(Math.random() * (maxSc + 1));
      const sr = margin + Math.floor(Math.random() * (maxSr + 1));

      for (let r = sr; r < sr + encH; r++) {
        for (let c = sc; c < sc + encW; c++) {
          addBrickAt(list, r, c, false);
          occupied.add(cellKey(r, c));
        }
      }

      const ringTop = sr - 1;
      const ringBot = sr + encH;
      const ringLeft = sc - 1;
      const ringRight = sc + encW;
      const ringCells = [];
      for (let r = ringTop; r <= ringBot; r++) {
        for (let c = ringLeft; c <= ringRight; c++) {
          const inner = r >= sr && r < sr + encH && c >= sc && c < sc + encW;
          if (inner) continue;
          const onRing = r === ringTop || r === ringBot || c === ringLeft || c === ringRight;
          if (onRing) ringCells.push([r, c]);
        }
      }

      if (ringCells.length > 0) {
        const gapKeys = new Set();

        function randomGapOnHorizontalEdge(row) {
          const cMin = ringLeft + 1;
          const cMax = ringRight - 1;
          const span = cMax - cMin + 1;
          if (span < 1) return [];
          const gapLen = 1 + Math.floor(Math.random() * span);
          const startC = cMin + Math.floor(Math.random() * (span - gapLen + 1));
          const out = [];
          for (let c = startC; c < startC + gapLen; c++) out.push([row, c]);
          return out;
        }

        function addGapCells(cells) {
          for (const [r, c] of cells) {
            gapKeys.add(cellKey(r, c));
          }
        }

        const span = ringRight - ringLeft - 1;
        if (span >= 1) {
          const mode = Math.random();
          if (mode < 1 / 3) {
            addGapCells(randomGapOnHorizontalEdge(ringTop));
          } else if (mode < 2 / 3) {
            addGapCells(randomGapOnHorizontalEdge(ringBot));
          } else {
            addGapCells(randomGapOnHorizontalEdge(ringTop));
            addGapCells(randomGapOnHorizontalEdge(ringBot));
          }
        }

        if (gapKeys.size === 0) {
          const onTB = ringCells.filter(([r]) => r === ringTop || r === ringBot);
          const nonCorners = onTB.filter(
            ([r, c]) => c > ringLeft && c < ringRight,
          );
          const pool = nonCorners.length > 0 ? nonCorners : onTB;
          if (pool.length > 0) {
            const pick = pool[Math.floor(Math.random() * pool.length)];
            gapKeys.add(cellKey(pick[0], pick[1]));
          }
        }

        for (const [r, c] of ringCells) {
          if (gapKeys.has(cellKey(r, c))) continue;
          const k = cellKey(r, c);
          if (occupied.has(k)) continue;
          addBrickAt(list, r, c, true, 215);
          occupied.add(k);
        }
      }
    }

    const fillChance = 0.38 + Math.random() * 0.22;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const k = cellKey(r, c);
        if (occupied.has(k)) continue;
        if (Math.random() < fillChance) {
          addBrickAt(list, r, c, false);
          occupied.add(k);
        }
      }
    }

    const extraSteel = 1 + Math.floor(Math.random() * 2);
    let placed = 0;
    let tries = 0;
    while (placed < extraSteel && tries < 120) {
      tries++;
      const r = Math.floor(Math.random() * GRID_ROWS);
      const c = Math.floor(Math.random() * COLS);
      const k = cellKey(r, c);
      if (occupied.has(k)) continue;
      addBrickAt(list, r, c, true, 208);
      occupied.add(k);
      placed++;
    }

    if (!list.some((b) => !b.indestructible)) {
      let t = 0;
      while (t < 50) {
        t++;
        const r = Math.floor(Math.random() * GRID_ROWS);
        const c = Math.floor(Math.random() * COLS);
        const k = cellKey(r, c);
        if (occupied.has(k)) continue;
        addBrickAt(list, r, c, false);
        occupied.add(k);
        break;
      }
    }

    bricks = list;
  }

  function destructibleRemaining() {
    return bricks.some((b) => b.alive && !b.indestructible);
  }

  function syncHud() {
    onScore?.(score);
    onLives?.(lives);
  }

  function heldBallPos() {
    const py = H - PADDLE_Y_OFF;
    return {
      x: paddleX + PADDLE_W / 2,
      y: py - BALL_R - 4,
    };
  }

  function maybeSpawnPowerUp(brick) {
    if (Math.random() >= POWERUP_SPAWN_CHANCE) return;
    powerUps.push({
      x: brick.x + brick.w / 2,
      y: brick.y + brick.h / 2,
      vy: POWERUP_FALL_VY,
      r: POWERUP_R,
    });
  }

  /**
   * 挡板接住技能：每颗现有球保留原速，同位置再「多出」两颗 45° 新球（不是 1 换 2）。
   * 无球时只在贴挡板处生成两颗新球。总数上限 MAX_BALLS。
   */
  function applySplitPickup() {
    const hsp = SPLIT_SPEED / Math.SQRT2;
    const snap = balls.length > 0 ? balls.slice() : [];

    function clampPos(x, y) {
      return {
        x: Math.max(BALL_R, Math.min(W - BALL_R, x)),
        y: Math.max(BALL_R, Math.min(H - PADDLE_Y_OFF - BALL_R - 8, y)),
      };
    }

    const next = [];
    if (snap.length === 0) {
      const h = heldBallPos();
      const p = clampPos(h.x, h.y);
      next.push({ x: p.x, y: p.y, vx: -hsp, vy: -hsp });
      if (next.length < MAX_BALLS) {
        next.push({ x: p.x, y: p.y, vx: hsp, vy: -hsp });
      }
    } else {
      for (const b of snap) {
        if (next.length >= MAX_BALLS) break;
        const p = clampPos(b.x, b.y);
        next.push({ x: p.x, y: p.y, vx: b.vx, vy: b.vy });
        if (next.length >= MAX_BALLS) break;
        next.push({ x: p.x, y: p.y, vx: -hsp, vy: -hsp });
        if (next.length >= MAX_BALLS) break;
        next.push({ x: p.x, y: p.y, vx: hsp, vy: -hsp });
      }
    }

    balls = next;
    launched = true;
  }

  function tryCollectPowerUps() {
    const py = H - PADDLE_Y_OFF;
    const next = [];
    for (const pu of powerUps) {
      const hitY = pu.y + pu.r >= py - 2 && pu.y - pu.r <= py + PADDLE_H + 4;
      const hitX = pu.x + pu.r >= paddleX && pu.x - pu.r <= paddleX + PADDLE_W;
      if (hitX && hitY) {
        applySplitPickup();
        continue;
      }
      if (pu.y - pu.r > H + 30) continue;
      next.push(pu);
    }
    powerUps = next;
  }

  function loseAllBallsLife() {
    lives -= 1;
    syncHud();
    balls = [];
    launched = false;
    if (lives <= 0) {
      stop();
      onLose?.(score);
      return;
    }
  }

  /**
   * 圆与轴对齐砖块：用最近点法线推出穿透再反射，避免嵌在边里每帧乱弹导致鬼畜。
   */
  function circleOverlapsBrick(b, ball) {
    const qx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
    const qy = Math.max(b.y, Math.min(ball.y, b.y + b.h));
    const dx = ball.x - qx;
    const dy = ball.y - qy;
    return dx * dx + dy * dy < BALL_R * BALL_R - 1e-4;
  }

  function resolveBrickCollision(b, ball) {
    const qx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
    const qy = Math.max(b.y, Math.min(ball.y, b.y + b.h));
    let dx = ball.x - qx;
    let dy = ball.y - qy;
    let d2 = dx * dx + dy * dy;
    const r2 = BALL_R * BALL_R;
    if (d2 > r2 + 1e-3) return false;

    const eps = 0.75;

    if (d2 < 1e-6) {
      const pL = ball.x - b.x;
      const pR = b.x + b.w - ball.x;
      const pT = ball.y - b.y;
      const pB = b.y + b.h - ball.y;
      let m = pL;
      let side = "l";
      if (pR < m) {
        m = pR;
        side = "r";
      }
      if (pT < m) {
        m = pT;
        side = "t";
      }
      if (pB < m) {
        side = "b";
      }
      if (side === "l") {
        ball.x = b.x - BALL_R - eps;
        if (ball.vx > 0) ball.vx *= -1;
      } else if (side === "r") {
        ball.x = b.x + b.w + BALL_R + eps;
        if (ball.vx < 0) ball.vx *= -1;
      } else if (side === "t") {
        ball.y = b.y - BALL_R - eps;
        if (ball.vy > 0) ball.vy *= -1;
      } else {
        ball.y = b.y + b.h + BALL_R + eps;
        if (ball.vy < 0) ball.vy *= -1;
      }
      return true;
    }

    const len = Math.sqrt(d2);
    const nx = dx / len;
    const ny = dy / len;
    const penetration = BALL_R - len;
    ball.x += nx * (penetration + eps);
    ball.y += ny * (penetration + eps);

    const velDot = ball.vx * nx + ball.vy * ny;
    if (velDot < 0) {
      ball.vx -= 2 * velDot * nx;
      ball.vy -= 2 * velDot * ny;
    }
    return true;
  }

  function capBallSpeed(ball) {
    const sp = Math.hypot(ball.vx, ball.vy);
    if (sp > BALL_SPEED_CAP) {
      ball.vx *= BALL_SPEED_CAP / sp;
      ball.vy *= BALL_SPEED_CAP / sp;
    }
  }

  function stepBall(ball) {
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x < BALL_R) {
      ball.x = BALL_R;
      ball.vx *= -1;
    }
    if (ball.x > W - BALL_R) {
      ball.x = W - BALL_R;
      ball.vx *= -1;
    }
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      ball.vy *= -1;
    }

    const py = H - PADDLE_Y_OFF;
    if (
      ball.y + BALL_R >= py &&
      ball.y + BALL_R <= py + PADDLE_H + 4 &&
      ball.x >= paddleX &&
      ball.x <= paddleX + PADDLE_W
    ) {
      ball.y = py - BALL_R;
      const hit = (ball.x - (paddleX + PADDLE_W / 2)) / (PADDLE_W / 2);
      ball.vx += hit * 2.4;
      ball.vy = -Math.abs(ball.vy) - 0.08;
      capBallSpeed(ball);
    }

    for (const b of bricks) {
      if (!b.alive) continue;
      if (!circleOverlapsBrick(b, ball)) continue;
      if (!resolveBrickCollision(b, ball)) continue;
      if (!b.indestructible) {
        b.alive = false;
        score += 10;
        maybeSpawnPowerUp(b);
        syncHud();
      }
      break;
    }
  }

  function stepPowerUpsFall() {
    for (const pu of powerUps) {
      pu.y += pu.vy;
    }
  }

  function step() {
    stepPowerUpsFall();
    tryCollectPowerUps();

    if (!launched) {
      if (!destructibleRemaining()) {
        stop();
        onWin?.(score);
      }
      return;
    }

    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      stepBall(ball);
      if (ball.y > H + 20) {
        balls.splice(i, 1);
        if (balls.length > 0) {
          /* 仍有其他球：不扣命、不重新部署 */
        } else {
          loseAllBallsLife();
        }
      }
    }

    if (!destructibleRemaining()) {
      stop();
      onWin?.(score);
    }
  }

  function drawBrick(b) {
    if (!b.alive) return;
    if (b.indestructible) {
      ctx.fillStyle = `hsl(${b.hue} 18% 38%)`;
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
    } else {
      ctx.fillStyle = `hsl(${b.hue} 65% 52%)`;
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
    }
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(b.x, b.y, b.w, b.h, 4);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
    if (b.indestructible) {
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.moveTo(b.x + 4, b.y + 4);
      ctx.lineTo(b.x + b.w - 4, b.y + b.h - 4);
      ctx.moveTo(b.x + b.w - 4, b.y + 4);
      ctx.lineTo(b.x + 4, b.y + b.h - 4);
      ctx.stroke();
    }
  }

  function drawBallAt(x, y) {
    const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, BALL_R);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.4, "#a5f3fc");
    g.addColorStop(1, "#0e7490");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPowerUp(pu) {
    const grd = ctx.createRadialGradient(pu.x - 3, pu.y - 3, 1, pu.x, pu.y, pu.r);
    grd.addColorStop(0, "#ffe566");
    grd.addColorStop(0.55, "#f59e0b");
    grd.addColorStop(1, "#d97706");
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, pu.r, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const dots = [
      [pu.x - 4, pu.y],
      [pu.x, pu.y - 2],
      [pu.x + 4, pu.y],
    ];
    ctx.fillStyle = "#fff";
    for (const [dx, dy] of dots) {
      ctx.beginPath();
      ctx.arc(dx, dy, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw() {
    ctx.fillStyle = "#0a0c12";
    ctx.fillRect(0, 0, W, H);

    bricks.forEach(drawBrick);

    for (const pu of powerUps) {
      drawPowerUp(pu);
    }

    const py = H - PADDLE_Y_OFF;
    ctx.fillStyle = "#6ee7b7";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(paddleX, py, PADDLE_W, PADDLE_H, 5);
      ctx.fill();
    } else {
      ctx.fillRect(paddleX, py, PADDLE_W, PADDLE_H);
    }

    if (!launched) {
      const h = heldBallPos();
      drawBallAt(h.x, h.y);
    } else {
      for (const ball of balls) {
        drawBallAt(ball.x, ball.y);
      }
    }
  }

  function loop() {
    if (!running) return;
    step();
    draw();
    raf = requestAnimationFrame(loop);
  }

  function reset() {
    stop();
    paddleX = W / 2 - PADDLE_W / 2;
    balls = [];
    launched = false;
    powerUps = [];
    score = 0;
    lives = 3;
    buildBricks();
    syncHud();
    draw();
  }

  /** 下一关：保留得分与生命，重随机砖块，球贴挡板待发 */
  function nextLevel() {
    stop();
    paddleX = W / 2 - PADDLE_W / 2;
    balls = [];
    launched = false;
    powerUps = [];
    buildBricks();
    syncHud();
    draw();
  }

  function launchBall() {
    if (!running || launched) return;
    const h = heldBallPos();
    const sp = randRange(BALL_VY_UP[0], BALL_VY_UP[1]);
    balls.push({ x: h.x, y: h.y, vx: 0, vy: -sp });
    launched = true;
  }

  function start() {
    if (running) return;
    running = true;
    loop();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function setPaddleFromClientX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = (clientX - rect.left) * scale - PADDLE_W / 2;
    paddleX = Math.max(0, Math.min(W - PADDLE_W, x));
  }

  reset();

  return { reset, nextLevel, start, stop, setPaddleFromClientX, launchBall };
}
