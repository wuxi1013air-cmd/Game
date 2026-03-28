const GRID = 20;
const CELL = 20;
const STORAGE_KEY = "mini-arcade-snake-best";

function fillRoundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }
}

export function createSnakeGame(canvas, { onScore, onGameOver, getBestEl }) {
  const ctx = canvas.getContext("2d");
  let snake = [];
  let dir = { x: 1, y: 0 };
  let pendingDir = { x: 1, y: 0 };
  let food = { x: 10, y: 10 };
  let score = 0;
  let best = Number(localStorage.getItem(STORAGE_KEY)) || 0;
  let tick = 0;
  let running = false;
  let raf = 0;
  const speedMs = 110;

  function bestScore() {
    return best;
  }

  function syncBest() {
    if (getBestEl) getBestEl.textContent = String(best);
  }

  function randomCell(avoid) {
    const taken = new Set(avoid.map((s) => `${s.x},${s.y}`));
    let x;
    let y;
    do {
      x = Math.floor(Math.random() * GRID);
      y = Math.floor(Math.random() * GRID);
    } while (taken.has(`${x},${y}`));
    return { x, y };
  }

  function reset() {
    snake = [
      { x: 5, y: 10 },
      { x: 4, y: 10 },
      { x: 3, y: 10 },
    ];
    dir = { x: 1, y: 0 };
    pendingDir = { x: 1, y: 0 };
    food = randomCell(snake);
    score = 0;
    syncBest();
    onScore(score);
    draw();
  }

  function draw() {
    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#1e2436";
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(canvas.width, i * CELL);
      ctx.stroke();
    }

    ctx.fillStyle = "#f472b6";
    fillRoundRect(ctx, food.x * CELL + 2, food.y * CELL + 2, CELL - 4, CELL - 4, 4);

    snake.forEach((seg, i) => {
      const g = 110 + Math.min(i * 8, 80);
      ctx.fillStyle = i === 0 ? "#6ee7b7" : `rgb(${60 + g * 0.2}, ${200 - i * 5}, ${180 - i * 4})`;
      fillRoundRect(ctx, seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2, 5);
    });
  }

  function step() {
    if (pendingDir.x !== -dir.x || pendingDir.y !== -dir.y) {
      dir = { ...pendingDir };
    }
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
      end();
      return;
    }
    if (snake.some((s) => s.x === head.x && s.y === head.y)) {
      end();
      return;
    }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      onScore(score);
      food = randomCell(snake);
    } else {
      snake.pop();
    }
    draw();
  }

  function end() {
    running = false;
    cancelAnimationFrame(raf);
    if (score > best) {
      best = score;
      localStorage.setItem(STORAGE_KEY, String(best));
      syncBest();
    }
    onGameOver(score);
  }

  function loop(ts) {
    if (!running) return;
    if (!loop.last) loop.last = ts;
    if (ts - loop.last >= speedMs) {
      loop.last = ts;
      step();
    }
    raf = requestAnimationFrame(loop);
  }

  function start() {
    running = true;
    loop.last = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function setDirection(dx, dy) {
    pendingDir = { x: dx, y: dy };
  }

  reset();
  syncBest();

  return {
    reset() {
      stop();
      reset();
      start();
    },
    start,
    stop,
    setDirection,
    bestScore,
    draw,
  };
}
