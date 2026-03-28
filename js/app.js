import { createSnakeGame } from "./snake.js";
import { createMinesweeper } from "./minesweeper.js";
import { createSolitaire } from "./solitaire.js";
import { createBreakout } from "./breakout.js";
import { createGame2048 } from "./game2048.js";

const views = {
  home: document.getElementById("view-home"),
  snake: document.getElementById("view-snake"),
  minesweeper: document.getElementById("view-minesweeper"),
  solitaire: document.getElementById("view-solitaire"),
  breakout: document.getElementById("view-breakout"),
  game2048: document.getElementById("view-2048"),
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
    const sm = document.getElementById("sol-score-modal");
    if (sm) {
      sm.classList.add("hidden");
      sm.setAttribute("aria-hidden", "true");
    }
    snakeApi.stop();
    breakoutApi.stop();
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
  if (!views.snake.classList.contains("active")) return;
  const m = keyMap[e.key];
  if (!m) return;
  e.preventDefault();
  snakeApi.setDirection(m[0], m[1]);
});

const breakoutScoreEl = document.getElementById("breakout-score");
const breakoutLivesEl = document.getElementById("breakout-lives");
const breakoutCanvas = document.getElementById("breakout-canvas");

const breakoutApi = createBreakout(breakoutCanvas, {
  onScore: (n) => {
    breakoutScoreEl.textContent = String(n);
  },
  onLives: (n) => {
    breakoutLivesEl.textContent = String(n);
  },
  onWin: (final) => {
    showOverlay("过关", `清完砖块！得分 ${final}。`);
  },
  onLose: (final) => {
    showOverlay("游戏结束", `生命用尽。得分 ${final}。`);
  },
});

document.getElementById("breakout-restart").addEventListener("click", () => {
  hideOverlay();
  breakoutApi.reset();
  breakoutApi.start();
});

function breakoutPointerMove(e) {
  if (!views.breakout.classList.contains("active")) return;
  breakoutApi.setPaddleFromClientX(e.clientX);
}

breakoutCanvas.addEventListener("pointermove", breakoutPointerMove);
breakoutCanvas.addEventListener("mousemove", breakoutPointerMove);

const g2048ScoreEl = document.getElementById("g2048-score");
const g2048BestEl = document.getElementById("g2048-best");

const game2048Api = createGame2048(document.getElementById("game2048-root"), {
  onScore: (n) => {
    g2048ScoreEl.textContent = String(n);
  },
  onBest: (n) => {
    g2048BestEl.textContent = String(n);
  },
  onWin: (n) => {
    showOverlay("达成 2048", `当前分数 ${n}。可继续挑战更高数字。`);
  },
  onLose: (n) => {
    showOverlay("无路可走", `本局结束，得分 ${n}。点击「新局」再试。`);
  },
});

document.getElementById("g2048-restart").addEventListener("click", () => {
  hideOverlay();
  game2048Api.reset();
});

const dir2048Map = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  a: "left",
  A: "left",
  d: "right",
  D: "right",
  w: "up",
  W: "up",
  s: "down",
  S: "down",
};

window.addEventListener("keydown", (e) => {
  if (!views.game2048.classList.contains("active")) return;
  const dir = dir2048Map[e.key];
  if (!dir) return;
  e.preventDefault();
  game2048Api.input(dir);
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

const SOL_SCORING_KEY = "mini-arcade-sol-scoring-on";
const solScoreEl = document.getElementById("sol-score");
const solMovesEl = document.getElementById("sol-moves");
const solBestEl = document.getElementById("sol-best");
const solScoringEnabled = document.getElementById("sol-scoring-enabled");
const solScoreModal = document.getElementById("sol-score-modal");

solScoringEnabled.checked = localStorage.getItem(SOL_SCORING_KEY) === "1";
solScoringEnabled.addEventListener("change", () => {
  localStorage.setItem(SOL_SCORING_KEY, solScoringEnabled.checked ? "1" : "0");
});

function openSolScoreModal() {
  solScoreModal.classList.remove("hidden");
  solScoreModal.setAttribute("aria-hidden", "false");
}

function closeSolScoreModal() {
  solScoreModal.classList.add("hidden");
  solScoreModal.setAttribute("aria-hidden", "true");
}

document.getElementById("sol-score-btn").addEventListener("click", openSolScoreModal);
document.getElementById("sol-modal-close").addEventListener("click", closeSolScoreModal);
document.getElementById("sol-score-modal-backdrop").addEventListener("click", closeSolScoreModal);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !solScoreModal.classList.contains("hidden")) {
    closeSolScoreModal();
  }
});

const solitaireApi = createSolitaire(document.getElementById("sol-root"), {
  isScoringMode: () => solScoringEnabled.checked,
  onWin: (finalScore) => {
    if (finalScore == null) {
      showOverlay("胜利", "已完成整副牌。当前为练习模式，未计分、不更新最佳纪录。");
      return;
    }
    const best = Number(localStorage.getItem("mini-arcade-solitaire-best")) || 0;
    showOverlay("胜利", `本局得分 ${finalScore} 分。历史最佳 ${best} 分（已写入本机）。`);
  },
  onScore: ({ score, moves, best }) => {
    solScoreEl.textContent = String(score);
    solMovesEl.textContent = String(moves);
    solBestEl.textContent = String(best);
  },
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
    } else if (game === "solitaire") {
      showView("solitaire");
      solitaireApi.reset();
    } else if (game === "breakout") {
      showView("breakout");
      breakoutApi.reset();
      breakoutApi.start();
    } else if (game === "game2048") {
      showView("game2048");
      game2048Api.reset();
    }
  });
});
