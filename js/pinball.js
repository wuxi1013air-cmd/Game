export function createPinball(canvas, { onScore, onBalls, onGameOver }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  let balls = 3;
  let score = 0;
  let running = false;
  let raf = 0;

  const ball = { x: W * 0.5, y: H * 0.35, vx: 2.2, vy: -1.5, r: 7 };
  const gravity = 0.14;
  const friction = 0.992;

  const bumpers = [
    { x: W * 0.28, y: H * 0.32, r: 22, pts: 100 },
    { x: W * 0.72, y: H * 0.32, r: 22, pts: 100 },
    { x: W * 0.5, y: H * 0.48, r: 18, pts: 200 },
  ];

  const walls = [
    { x1: 40, y1: 60, x2: W - 40, y2: 60 },
    { x1: 40, y1: 60, x2: 20, y2: H - 120 },
    { x1: W - 40, y1: 60, x2: W - 20, y2: H - 120 },
    { x1: 20, y1: H - 120, x2: W - 20, y2: H - 120 },
  ];

  const flipperL = {
    cx: W * 0.32,
    cy: H - 95,
    len: 72,
    angle: 0.35,
    minA: 0.05,
    maxA: 0.95,
    pressed: false,
    speed: 0.18,
  };
  const flipperR = {
    cx: W * 0.68,
    cy: H - 95,
    len: 72,
    angle: Math.PI - 0.35,
    minA: Math.PI - 0.95,
    maxA: Math.PI - 0.05,
    pressed: false,
    speed: 0.18,
  };

  function segNormal(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    return { nx: -dy / len, ny: dx / len };
  }

  function distPointSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
    const qx = x1 + t * dx;
    const qy = y1 + t * dy;
    return { d: Math.hypot(px - qx, py - qy), qx, qy, nx: px - qx, ny: py - qy };
  }

  function reflect(nx, ny) {
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= 2 * dot * nx;
      ball.vy -= 2 * dot * ny;
    }
  }

  function updateFlippers() {
    [flipperL, flipperR].forEach((f) => {
      if (f === flipperL) {
        if (f.pressed) f.angle = Math.min(f.maxA, f.angle + f.speed);
        else f.angle = Math.max(f.minA, f.angle - f.speed);
      } else {
        if (f.pressed) f.angle = Math.max(f.minA, f.angle - f.speed);
        else f.angle = Math.min(f.maxA, f.angle + f.speed);
      }
    });
  }

  function flipperSeg(f) {
    const x2 = f.cx + Math.cos(f.angle) * f.len;
    const y2 = f.cy + Math.sin(f.angle) * f.len;
    return { x1: f.cx, y1: f.cy, x2, y2 };
  }

  function physics() {
    ball.vy += gravity;
    ball.vx *= friction;
    ball.vy *= friction;
    ball.x += ball.vx;
    ball.y += ball.vy;

    walls.forEach((w) => {
      const { d, qx, qy, nx, ny } = distPointSeg(ball.x, ball.y, w.x1, w.y1, w.x2, w.y2);
      if (d < ball.r) {
        ball.x = qx + (nx / (Math.hypot(nx, ny) || 1)) * (ball.r + 0.5);
        ball.y = qy + (ny / (Math.hypot(nx, ny) || 1)) * (ball.r + 0.5);
        const { nx: nnx, ny: nny } = segNormal(w.x1, w.y1, w.x2, w.y2);
        reflect(nnx, nny);
        ball.vx *= 1.02;
        ball.vy *= 1.02;
      }
    });

    [flipperL, flipperR].forEach((f) => {
      const s = flipperSeg(f);
      const { d, qx, qy, nx, ny } = distPointSeg(ball.x, ball.y, s.x1, s.y1, s.x2, s.y2);
      if (d < ball.r + 4 && f.pressed) {
        ball.x = qx + (nx / (Math.hypot(nx, ny) || 1)) * (ball.r + 4);
        ball.y = qy + (ny / (Math.hypot(nx, ny) || 1)) * (ball.r + 4);
        const { nx: nnx, ny: nny } = segNormal(s.x1, s.y1, s.x2, s.y2);
        reflect(nnx, nny);
        ball.vy -= 2.8;
        ball.vx += f === flipperL ? 1.2 : -1.2;
      }
    });

    bumpers.forEach((b) => {
      const d = Math.hypot(ball.x - b.x, ball.y - b.y);
      if (d < b.r + ball.r) {
        const nx = (ball.x - b.x) / (d || 1);
        const ny = (ball.y - b.y) / (d || 1);
        ball.x = b.x + nx * (b.r + ball.r + 1);
        ball.y = b.y + ny * (b.r + ball.r + 1);
        reflect(nx, ny);
        ball.vx *= 1.08;
        ball.vy *= 1.08;
        score += b.pts;
        onScore(score);
      }
    });

    if (ball.x < ball.r) {
      ball.x = ball.r;
      ball.vx *= -0.85;
    }
    if (ball.x > W - ball.r) {
      ball.x = W - ball.r;
      ball.vx *= -0.85;
    }
    if (ball.y < ball.r) {
      ball.y = ball.r;
      ball.vy *= -0.75;
    }

    if (ball.y > H + 40) {
      balls -= 1;
      onBalls(balls);
      if (balls <= 0) {
        stop();
        onGameOver(score);
        return;
      }
      ball.x = W * 0.5;
      ball.y = H * 0.28;
      ball.vx = (Math.random() - 0.5) * 4;
      ball.vy = -2;
    }
  }

  function drawTable3D() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1a0a2e");
    g.addColorStop(0.45, "#2d1b4e");
    g.addColorStop(1, "#0d0518");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(110, 231, 183, 0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 60);
    ctx.lineTo(W - 40, 60);
    ctx.lineTo(W - 20, H - 120);
    ctx.lineTo(20, H - 120);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.moveTo(48, 68);
    ctx.lineTo(W - 48, 68);
    ctx.lineTo(W - 28, H - 128);
    ctx.lineTo(28, H - 128);
    ctx.closePath();
    ctx.fill();
  }

  function drawBumpers() {
    bumpers.forEach((b) => {
      const rg = ctx.createRadialGradient(b.x - 6, b.y - 6, 2, b.x, b.y, b.r);
      rg.addColorStop(0, "#fbbf24");
      rg.addColorStop(0.6, "#d97706");
      rg.addColorStop(1, "#78350f");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  function drawFlippers() {
    [flipperL, flipperR].forEach((f) => {
      const s = flipperSeg(f);
      ctx.strokeStyle = "#6ee7b7";
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    });
  }

  function drawBall() {
    const g = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, ball.r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, "#a5f3fc");
    g.addColorStop(1, "#0e7490");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    drawTable3D();
    walls.forEach((w) => {
      ctx.strokeStyle = "rgba(167, 139, 250, 0.5)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    });
    drawBumpers();
    drawFlippers();
    drawBall();
  }

  function tick() {
    if (!running) return;
    updateFlippers();
    physics();
    draw();
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    tick();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function reset() {
    stop();
    balls = 3;
    score = 0;
    onScore(0);
    onBalls(3);
    ball.x = W * 0.5;
    ball.y = H * 0.28;
    ball.vx = (Math.random() - 0.5) * 3;
    ball.vy = -2;
    flipperL.angle = flipperL.minA;
    flipperR.angle = flipperR.maxA;
    draw();
  }

  function setLeft(down) {
    flipperL.pressed = down;
  }
  function setRight(down) {
    flipperR.pressed = down;
  }

  reset();

  return { start, stop, reset, setLeft, setRight };
}
