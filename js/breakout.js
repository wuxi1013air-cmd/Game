const COLS = 10;
const ROWS = 5;
const PADDLE_W = 88;
const PADDLE_H = 10;
const BALL_R = 6;
const BRICK_H = 22;
const PADDLE_Y_OFF = 28;

export function createBreakout(canvas, { onScore, onLives, onWin, onLose }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const brickW = (W - 20) / COLS;
  const brickTop = 48;

  let paddleX = W / 2 - PADDLE_W / 2;
  let ball = { x: W / 2, y: H - PADDLE_Y_OFF - BALL_R - 20, vx: 3.2, vy: -3.2 };
  let bricks = [];
  let score = 0;
  let lives = 3;
  let running = false;
  let raf = 0;

  function buildBricks() {
    bricks = [];
    const hues = [330, 280, 220, 160, 110];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        bricks.push({
          x: 10 + c * brickW,
          y: brickTop + r * (BRICK_H + 4),
          w: brickW - 3,
          h: BRICK_H,
          alive: true,
          hue: hues[r % hues.length],
        });
      }
    }
  }

  function syncHud() {
    onScore?.(score);
    onLives?.(lives);
  }

  function reset() {
    stop();
    paddleX = W / 2 - PADDLE_W / 2;
    ball = {
      x: W / 2,
      y: H - PADDLE_Y_OFF - PADDLE_H - BALL_R - 4,
      vx: (Math.random() > 0.5 ? 1 : -1) * (2.8 + Math.random() * 0.8),
      vy: -3.4,
    };
    score = 0;
    lives = 3;
    buildBricks();
    syncHud();
    draw();
  }

  function draw() {
    ctx.fillStyle = "#0a0c12";
    ctx.fillRect(0, 0, W, H);

    bricks.forEach((b) => {
      if (!b.alive) return;
      ctx.fillStyle = `hsl(${b.hue} 65% 52%)`;
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
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
    });

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
      ball.vx += hit * 2.2;
      ball.vy = -Math.abs(ball.vy) - 0.05;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > 7) {
        ball.vx *= 7 / sp;
        ball.vy *= 7 / sp;
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
        b.alive = false;
        score += 10;
        syncHud();
        reflectBrick(b);
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
      ball.x = paddleX + PADDLE_W / 2;
      ball.y = py - BALL_R - 4;
      ball.vx = (Math.random() > 0.5 ? 1 : -1) * 2.8;
      ball.vy = -3.2;
    }

    if (!bricks.some((b) => b.alive)) {
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
