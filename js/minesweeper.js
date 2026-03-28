const DIFFICULTIES = {
  beginner: { cols: 9, rows: 9, mines: 10 },
  intermediate: { cols: 16, rows: 14, mines: 40 },
};

export function createMinesweeper(rootEl, { onStatus, onWin, onLose }) {
  let diffKey = "intermediate";
  let board = [];
  let revealed = [];
  let flagged = [];
  let cols = 0;
  let rows = 0;
  let mineCount = 0;
  let firstClick = true;
  let gameOver = false;
  let won = false;

  function idx(c, r) {
    return r * cols + c;
  }

  function neighbors(c, r) {
    const out = [];
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) out.push([nc, nr]);
      }
    }
    return out;
  }

  function placeMines(safeC, safeR) {
    const safe = new Set();
    safe.add(idx(safeC, safeR));
    neighbors(safeC, safeR).forEach(([nc, nr]) => safe.add(idx(nc, nr)));
    const pool = [];
    for (let i = 0; i < cols * rows; i++) {
      if (!safe.has(i)) pool.push(i);
    }
    for (let m = 0; m < mineCount; m++) {
      const j = m + Math.floor(Math.random() * (pool.length - m));
      [pool[m], pool[j]] = [pool[j], pool[m]];
    }
    board = new Array(cols * rows).fill(0);
    for (let m = 0; m < mineCount; m++) {
      const i = pool[m];
      board[i] = -1;
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = idx(c, r);
        if (board[i] === -1) continue;
        let n = 0;
        neighbors(c, r).forEach(([nc, nr]) => {
          if (board[idx(nc, nr)] === -1) n++;
        });
        board[i] = n;
      }
    }
  }

  function countFlags(c, r) {
    let n = 0;
    neighbors(c, r).forEach(([nc, nr]) => {
      if (flagged[idx(nc, nr)]) n++;
    });
    return n;
  }

  function reveal(c, r) {
    const i = idx(c, r);
    if (flagged[i] || revealed[i]) return;
    if (firstClick) {
      firstClick = false;
      placeMines(c, r);
    }
    if (board[i] === -1) {
      gameOver = true;
      for (let j = 0; j < board.length; j++) {
        if (board[j] === -1) revealed[j] = true;
      }
      onLose();
      return;
    }
    const stack = [[c, r]];
    while (stack.length) {
      const [cc, cr] = stack.pop();
      const ii = idx(cc, cr);
      if (flagged[ii] || revealed[ii]) continue;
      revealed[ii] = true;
      if (board[ii] === 0) {
        neighbors(cc, cr).forEach(([nc, nr]) => {
          if (!revealed[idx(nc, nr)]) stack.push([nc, nr]);
        });
      }
    }
    checkWin();
  }

  function chord(c, r) {
    const i = idx(c, r);
    if (!revealed[i] || board[i] <= 0) return;
    if (countFlags(c, r) !== board[i]) return;
    for (const [nc, nr] of neighbors(c, r)) {
      if (gameOver) break;
      const ni = idx(nc, nr);
      if (!revealed[ni] && !flagged[ni]) {
        if (board[ni] === -1) {
          gameOver = true;
          for (let j = 0; j < board.length; j++) {
            if (board[j] === -1) revealed[j] = true;
          }
          onLose();
          break;
        }
        reveal(nc, nr);
      }
    }
  }

  function checkWin() {
    let hidden = 0;
    for (let i = 0; i < board.length; i++) {
      if (!revealed[i] && board[i] !== -1) hidden++;
    }
    if (hidden === 0 && !gameOver) {
      won = true;
      gameOver = true;
      onWin();
    }
  }

  function flagCount() {
    let f = 0;
    for (let i = 0; i < flagged.length; i++) if (flagged[i]) f++;
    return mineCount - f;
  }

  function updateStatus() {
    onStatus({ remaining: flagCount(), dead: gameOver, won });
  }

  function render() {
    rootEl.innerHTML = "";
    rootEl.className = "ms-board";
    rootEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = idx(c, r);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ms-cell";
        const isRev = revealed[i];
        const isMine = board[i] === -1;
        if (!isRev) {
          btn.classList.add("covered");
          if (flagged[i]) {
            btn.classList.add("flagged");
            btn.textContent = "🚩";
            btn.setAttribute("aria-label", "已标记");
          }
        } else {
          btn.classList.add("open");
          if (isMine) {
            btn.classList.add("mine");
            btn.textContent = "●";
          } else if (board[i] > 0) {
            btn.textContent = String(board[i]);
            btn.dataset.n = String(board[i]);
          }
        }
        btn.disabled = gameOver && !isRev;
        btn.addEventListener("click", (e) => {
          if (gameOver) return;
          if (e.shiftKey || e.altKey) {
            e.preventDefault();
            if (!revealed[i] && !won) {
              flagged[i] = !flagged[i];
              render();
              updateStatus();
            }
            return;
          }
          if (flagged[i]) return;
          if (revealed[i] && board[i] > 0) {
            chord(c, r);
            render();
            updateStatus();
            return;
          }
          if (!revealed[i]) reveal(c, r);
          render();
          updateStatus();
        });
        btn.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          if (gameOver || revealed[i]) return;
          flagged[i] = !flagged[i];
          render();
          updateStatus();
        });
        rootEl.append(btn);
      }
    }
  }

  function reset(newDiff) {
    if (newDiff) diffKey = newDiff;
    const d = DIFFICULTIES[diffKey];
    cols = d.cols;
    rows = d.rows;
    mineCount = d.mines;
    board = new Array(cols * rows).fill(0);
    revealed = new Array(cols * rows).fill(false);
    flagged = new Array(cols * rows).fill(false);
    firstClick = true;
    gameOver = false;
    won = false;
    render();
    updateStatus();
  }

  function setDifficulty(key) {
    reset(key);
  }

  reset();

  return { reset, setDifficulty, getDifficulty: () => diffKey };
}
