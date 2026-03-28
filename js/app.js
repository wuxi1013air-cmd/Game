import { createSnakeGame } from "./snake.js";
import { createMinesweeper } from "./minesweeper.js";
import { createSolitaire } from "./solitaire.js";

const views = {
  home: document.getElementById("view-home"),
  snake: document.getElementById("view-snake"),
  minesweeper: document.getElementById("view-minesweeper"),
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
    const sm = document.getElementById("sol-score-modal");
    if (sm) {
      sm.classList.add("hidden");
      sm.setAttribute("aria-hidden", "true");
    }
    snakeApi.stop();
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
  dragHudEl: document.getElementById("sol-drag-hud"),
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
    }
  });
});
