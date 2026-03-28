import { createSnakeGame } from "./snake.js";
import { createMemoryGame } from "./memory.js";

const views = {
  home: document.getElementById("view-home"),
  snake: document.getElementById("view-snake"),
  memory: document.getElementById("view-memory"),
};

const overlay = document.getElementById("overlay");
const overlayMsg = document.getElementById("overlay-msg");
const overlayTitle = document.getElementById("overlay-title");
const overlayDismiss = document.getElementById("overlay-dismiss");

function showView(name) {
  Object.values(views).forEach((el) => el.classList.remove("active"));
  views[name].classList.add("active");
}

function showOverlay(title, msg) {
  overlayTitle.textContent = title;
  overlayMsg.textContent = msg;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

overlayDismiss.addEventListener("click", hideOverlay);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) hideOverlay();
});

document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => {
    hideOverlay();
    snakeApi.stop();
    showView("home");
  });
});

document.querySelectorAll(".game-card").forEach((card) => {
  card.addEventListener("click", () => {
    const game = card.dataset.game;
    if (game === "snake") {
      showView("snake");
      snakeApi.reset();
      snakeApi.start();
    } else if (game === "memory") {
      showView("memory");
      memoryApi.reset();
    }
  });
});

const scoreEl = document.getElementById("snake-score");
const bestEl = document.getElementById("snake-best");

const snakeApi = createSnakeGame(document.getElementById("snake-canvas"), {
  onScore: (n) => {
    scoreEl.textContent = String(n);
  },
  onGameOver: (final) => {
    showOverlay("游戏结束", `本局得分 ${final}。按「知道了」返回或点重新开始。`);
  },
  getBestEl: bestEl,
});

document.getElementById("snake-restart").addEventListener("click", () => {
  hideOverlay();
  snakeApi.reset();
  snakeApi.start();
});

const keyMap = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  W: [0, -1],
  S: [0, 1],
  A: [-1, 0],
  D: [1, 0],
};

window.addEventListener("keydown", (e) => {
  if (!views.snake.classList.contains("active")) return;
  const m = keyMap[e.key];
  if (!m) return;
  e.preventDefault();
  snakeApi.setDirection(m[0], m[1]);
});

const movesEl = document.getElementById("memory-moves");
const pairsEl = document.getElementById("memory-pairs");

const memoryApi = createMemoryGame(document.getElementById("memory-board"), {
  onMoves: (n) => {
    movesEl.textContent = String(n);
  },
  onPairs: (n, total) => {
    pairsEl.textContent = `${n} / ${total}`;
  },
  onWin: (m) => {
    showOverlay("全部配对！", `恭喜！共用 ${m} 步完成。`);
  },
});

document.getElementById("memory-restart").addEventListener("click", () => {
  hideOverlay();
  memoryApi.reset();
});
