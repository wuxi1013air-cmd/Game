const SIZE = 4;
const BEST_KEY = "mini-arcade-2048-best";

function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function pickRandomEmpty(grid) {
  const free = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === 0) free.push([r, c]);
    }
  }
  if (!free.length) return null;
  return free[Math.floor(Math.random() * free.length)];
}

function addTile(grid) {
  const p = pickRandomEmpty(grid);
  if (!p) return false;
  grid[p[0]][p[1]] = Math.random() < 0.9 ? 2 : 4;
  return true;
}

function slideLineLeft(line) {
  const nums = line.filter((n) => n !== 0);
  const out = [];
  let scoreAdd = 0;
  let i = 0;
  while (i < nums.length) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      const v = nums[i] * 2;
      out.push(v);
      scoreAdd += v;
      i += 2;
    } else {
      out.push(nums[i]);
      i += 1;
    }
  }
  while (out.length < SIZE) out.push(0);
  return { line: out, scoreAdd };
}

function transpose(g) {
  const t = emptyGrid();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      t[c][r] = g[r][c];
    }
  }
  return t;
}

function moveLeft(grid) {
  const next = emptyGrid();
  let moved = false;
  let scoreAdd = 0;
  for (let r = 0; r < SIZE; r++) {
    const { line, scoreAdd: add } = slideLineLeft(grid[r]);
    scoreAdd += add;
    for (let c = 0; c < SIZE; c++) {
      if (line[c] !== grid[r][c]) moved = true;
      next[r][c] = line[c];
    }
  }
  return { grid: next, moved, scoreAdd };
}

function moveRight(grid) {
  const next = emptyGrid();
  let moved = false;
  let scoreAdd = 0;
  for (let r = 0; r < SIZE; r++) {
    const rev = [...grid[r]].reverse();
    const { line: sl, scoreAdd: add } = slideLineLeft(rev);
    const line = sl.reverse();
    scoreAdd += add;
    for (let c = 0; c < SIZE; c++) {
      if (line[c] !== grid[r][c]) moved = true;
      next[r][c] = line[c];
    }
  }
  return { grid: next, moved, scoreAdd };
}

function moveUp(grid) {
  const t = transpose(grid);
  const { grid: nt, moved, scoreAdd } = moveLeft(t);
  return { grid: transpose(nt), moved, scoreAdd };
}

function moveDown(grid) {
  const t = transpose(grid);
  const { grid: nt, moved, scoreAdd } = moveRight(t);
  return { grid: transpose(nt), moved, scoreAdd };
}

function applyMove(grid, dir) {
  if (dir === "left") return moveLeft(grid);
  if (dir === "right") return moveRight(grid);
  if (dir === "up") return moveUp(grid);
  return moveDown(grid);
}

function maxTile(grid) {
  let m = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) m = Math.max(m, grid[r][c]);
  }
  return m;
}

function canMove(grid) {
  for (const d of ["left", "right", "up", "down"]) {
    const { moved } = applyMove(grid, d);
    if (moved) return true;
  }
  return false;
}

function bestEver() {
  return Number(localStorage.getItem(BEST_KEY)) || 0;
}

function saveBest(n) {
  localStorage.setItem(BEST_KEY, String(n));
}

export function createGame2048(container, { onScore, onBest, onWin, onLose }) {
  let grid = emptyGrid();
  let score = 0;
  let wonShown = false;
  let gameOver = false;

  function tileClass(v) {
    if (v === 0) return "g2048-tile--empty";
    const known = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
    if (known.includes(v)) return `g2048-tile--n${v}`;
    return "g2048-tile--nbig";
  }

  function render() {
    container.innerHTML = "";
    container.className = "g2048-board";
    const wrap = document.createElement("div");
    wrap.className = "g2048-grid";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c];
        const cell = document.createElement("div");
        cell.className = "g2048-cell";
        const tile = document.createElement("div");
        tile.className = `g2048-tile ${tileClass(v)}`;
        if (v) tile.textContent = String(v);
        cell.append(tile);
        wrap.append(cell);
      }
    }
    container.append(wrap);
  }

  function syncHud() {
    const b = bestEver();
    const hi = Math.max(b, score);
    if (score >= b) saveBest(score);
    onScore?.(score);
    onBest?.(hi);
  }

  function reset() {
    grid = emptyGrid();
    score = 0;
    wonShown = false;
    gameOver = false;
    addTile(grid);
    addTile(grid);
    syncHud();
    render();
  }

  function input(dir) {
    if (gameOver) return;
    const { grid: next, moved, scoreAdd } = applyMove(grid, dir);
    if (!moved) return;
    grid = next;
    score += scoreAdd;
    addTile(grid);
    syncHud();
    render();

    if (!wonShown && maxTile(grid) >= 2048) {
      wonShown = true;
      onWin?.(score);
    }
    if (!canMove(grid)) {
      gameOver = true;
      onLose?.(score);
    }
  }

  reset();

  return { reset, input };
}
