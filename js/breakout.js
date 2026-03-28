const COLS = 10;
const GRID_ROWS = 7;
const PADDLE_W = 88;
const PADDLE_H = 10;
const BALL_R = 6;
const BRICK_H = 22;
const PADDLE_Y_OFF = 28;

/** 球速区间（每帧像素，较原版更快） */
const BALL_VX_RANGE = [3.6, 5.4];
const BALL_VY_UP = [4.2, 5.2];
const BALL_SPEED_CAP = 10.5;

export function createBreakout(canvas, { onScore, onLives, onWin, onLose }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const brickW = (W - 20) / COLS;
  const brickTop = 44;
  const rowGap = 4;

  let paddleX = W / 2 - PADDLE_W / 2;
  let ball = { x: W / 2, y: H - PADDLE_Y_OFF - BALL_R - 20, vx: 4, vy: -4.5 };
  let bricks = [];
  let score = 0;
  let lives = 3;
  let running = false;
  let raf = 0;

  function randRange(a, b) {
    return a + Math.random() * (b - a);
  }

  function randomBallVelocity() {
    const sign = Math.random() > 0.5 ? 1 : -1;
    const vx = sign * randRange(BALL_VX_RANGE[0], BALL_VX_RANGE[1]);
    const vy = -randRange(BALL_VY_UP[0], BALL_VY_UP[1]);
    return { vx, vy };
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
   * 随机布局：可破坏砖稀疏/随机填充 + 一组被不可破坏「围墙」围住（留一缺口）的砖 + 少量散落钢砖。
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
        const gapI = Math.floor(Math.random() * ringCells.length);
        for (let i = 0; i < ringCells.length; i++) {
          if (i === gapI) continue;
          const [r, c] = ringCells[i];
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

  function reset() {
    stop();
    paddleX = W / 2 - PADDLE_W / 2;
    const v = randomBallVelocity();
    ball = {
      x: W / 2,
      y: H - PADDLE_Y_OFF - PADDLE_H - BALL_R - 4,
      vx: v.vx,
      vy: v.vy,
    };
    score = 0;
    lives = 3;
    buildBricks();
    syncHud();
    draw();
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

  function draw() {
    ctx.fillStyle = "#0a0c12";
    ctx.fillRect(0, 0, W, H);

    bricks.forEach(drawBrick);

    const py = H - PADDLE_Y_OFF;
    ctx.fillStyle = "#6ee7b7";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(paddleX, py, PADDLE_W, PADDLE_H, 5);
      ctx.fill();
    } else {
      ctx.fillRect(paddleX, py, PADDLE_W, PADDLE_H);
    }

    const g = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, BALL_R);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.4, "#a5f3fc");
    g.addColorStop(1, "#0e7490");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }

  function reflectBrick(b) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    if (Math.abs(dx / b.w) > Math.abs(dy / b.h)) {
      ball.vx *= -1;
    } else {
      ball.vy *= -1;
    }
  }

  function step() {
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
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > BALL_SPEED_CAP) {
        ball.vx *= BALL_SPEED_CAP / sp;
        ball.vy *= BALL_SPEED_CAP / sp;
      }
    }

    for (const b of bricks) {
      if (!b.alive) continue;
      if (
        ball.x + BALL_R > b.x &&
        ball.x - BALL_R < b.x + b.w &&
        ball.y + BALL_R > b.y &&
        ball.y - BALL_R < b.y + b.h
      ) {
        reflectBrick(b);
        if (!b.indestructible) {
          b.alive = false;
          score += 10;
          syncHud();
        }
        break;
      }
    }

    if (ball.y > H + 20) {
      lives -= 1;
      syncHud();
      if (lives <= 0) {
        stop();
        onLose?.(score);
        return;
      }
      const v = randomBallVelocity();
      ball.x = paddleX + PADDLE_W / 2;
      ball.y = py - BALL_R - 4;
      ball.vx = v.vx;
      ball.vy = v.vy;
    }

    if (!destructibleRemaining()) {
      stop();
      onWin?.(score);
    }
  }

  function loop() {
    if (!running) return;
    step();
    draw();
    raf = requestAnimationFrame(loop);
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

  return { reset, start, stop, setPaddleFromClientX };
}
