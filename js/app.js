import { createSnakeGame } from "./snake.js";
import { createMinesweeper } from "./minesweeper.js";
import { createPinball } from "./pinball.js";
import { createSolitaire } from "./solitaire.js";

const views = {
  home: document.getElementById("view-home"),
  snake: document.getElementById("view-snake"),
  minesweeper: document.getElementById("view-minesweeper"),
  pinball: document.getElementById("view-pinball"),
  solitaire: document.getElementById("view-solitaire"),
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
    pinballApi.stop();
    showView("home");
  });
});

const scoreEl = document.getElementById("snake-score");
const bestEl = document.getElementById("snake-best");

const snakeApi = createSnakeGame(document.getElementById("snake-canvas"), {
  onScore: (n) => {
    scoreEl.textContent = String(n);
  },
  onGameOver: (final) => {
    showOverlay("游戏结束", `本局得分 ${final}。`);
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
  if (views.snake.classList.contains("active")) {
    const m = keyMap[e.key];
    if (m) {
      e.preventDefault();
      snakeApi.setDirection(m[0], m[1]);
    }
    return;
  }
  if (views.pinball.classList.contains("active")) {
    if (e.key === "z" || e.key === "Z" || e.key === "ArrowLeft") {
      e.preventDefault();
      pinballApi.setLeft(true);
    }
    if (e.key === "m" || e.key === "M" || e.key === "ArrowRight") {
      e.preventDefault();
      pinballApi.setRight(true);
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (!views.pinball.classList.contains("active")) return;
  if (e.key === "z" || e.key === "Z" || e.key === "ArrowLeft") pinballApi.setLeft(false);
  if (e.key === "m" || e.key === "M" || e.key === "ArrowRight") pinballApi.setRight(false);
});

const msRemaining = document.getElementById("ms-remaining");
const msStatus = document.getElementById("ms-status");
const msDifficulty = document.getElementById("ms-difficulty");

const minesApi = createMinesweeper(document.getElementById("ms-root"), {
  onStatus: ({ remaining, dead, won }) => {
    msRemaining.textContent = String(remaining);
    if (won) msStatus.textContent = "已通关";
    else if (dead) msStatus.textContent = "爆炸";
    else msStatus.textContent = "";
  },
  onWin: () => showOverlay("扫雷完成", "所有安全格已翻开！"),
  onLose: () => showOverlay("踩到雷了", "点击「新局」或返回首页再试。"),
});

document.getElementById("ms-restart").addEventListener("click", () => {
  hideOverlay();
  minesApi.reset();
});

msDifficulty.addEventListener("change", () => {
  hideOverlay();
  minesApi.setDifficulty(msDifficulty.value);
});

const pbScore = document.getElementById("pb-score");
const pbBalls = document.getElementById("pb-balls");

const pinballApi = createPinball(document.getElementById("pinball-canvas"), {
  onScore: (n) => {
    pbScore.textContent = String(n);
  },
  onBalls: (n) => {
    pbBalls.textContent = String(n);
  },
  onGameOver: (final) => {
    showOverlay("弹珠用尽", `本局得分 ${final}。点「重来」再玩。`);
  },
});

document.getElementById("pb-restart").addEventListener("click", () => {
  hideOverlay();
  pinballApi.reset();
  pinballApi.start();
});

const solitaireApi = createSolitaire(document.getElementById("sol-root"), {
  onWin: () => showOverlay("胜利", "四花色都已接到 K！"),
});

document.getElementById("sol-restart").addEventListener("click", () => {
  hideOverlay();
  solitaireApi.reset();
});

document.querySelectorAll(".game-card").forEach((card) => {
  card.addEventListener("click", () => {
    const game = card.dataset.game;
    hideOverlay();
    if (game === "snake") {
      showView("snake");
      snakeApi.reset();
      snakeApi.start();
    } else if (game === "minesweeper") {
      showView("minesweeper");
      minesApi.setDifficulty(msDifficulty.value);
    } else if (game === "pinball") {
      showView("pinball");
      pinballApi.reset();
      pinballApi.start();
    } else if (game === "solitaire") {
      showView("solitaire");
      solitaireApi.reset();
    }
  });
});
