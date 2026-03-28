const SIZE = 4;
const BEST_KEY = "mini-arcade-2048-best";
const SLIDE_MS = 120;
const SLIDE_EASING = "cubic-bezier(0.25, 0.1, 0.25, 1)";

function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function emptyAnimGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
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

/** @returns {[number, number] | null} 新方块坐标 */
function addTile(grid) {
  const p = pickRandomEmpty(grid);
  if (!p) return null;
  grid[p[0]][p[1]] = Math.random() < 0.9 ? 2 : 4;
  return p;
}

/**
 * 左滑一行；meta[c] 表示输出列 c 上非零块的来源列（原行内索引）与是否合并。
 */
function slideLineLeft(line) {
  const entries = [];
  for (let c = 0; c < SIZE; c++) {
    if (line[c] !== 0) entries.push({ col: c, val: line[c] });
  }
  const outLine = [];
  const meta = [];
  let scoreAdd = 0;
  let i = 0;
  while (i < entries.length) {
    if (i + 1 < entries.length && entries[i].val === entries[i + 1].val) {
      const v = entries[i].val * 2;
      outLine.push(v);
      meta.push({
        sources: [entries[i].col, entries[i + 1].col],
        merged: true,
      });
      scoreAdd += v;
      i += 2;
    } else {
      outLine.push(entries[i].val);
      meta.push({ sources: [entries[i].col], merged: false });
      i += 1;
    }
  }
  while (outLine.length < SIZE) {
    outLine.push(0);
    meta.push(null);
  }
  return { line: outLine, scoreAdd, meta };
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

function moveLeftWithMeta(grid) {
  const next = emptyGrid();
  const animMeta = emptyAnimGrid();
  let moved = false;
  let scoreAdd = 0;
  for (let r = 0; r < SIZE; r++) {
    const { line, scoreAdd: add, meta } = slideLineLeft(grid[r]);
    scoreAdd += add;
    for (let c = 0; c < SIZE; c++) {
      if (line[c] !== grid[r][c]) moved = true;
      next[r][c] = line[c];
      if (meta[c]) {
        animMeta[r][c] = {
          sources: meta[c].sources.map((col) => [r, col]),
          merged: meta[c].merged,
        };
      }
    }
  }
  return { grid: next, moved, scoreAdd, animMeta };
}

function moveRightWithMeta(grid) {
  const next = emptyGrid();
  const animMeta = emptyAnimGrid();
  let moved = false;
  let scoreAdd = 0;
  for (let r = 0; r < SIZE; r++) {
    const rev = [...grid[r]].reverse();
    const { line: sl, scoreAdd: add, meta: mRev } = slideLineLeft(rev);
    scoreAdd += add;
    for (let c = 0; c < SIZE; c++) {
      const val = sl[SIZE - 1 - c];
      if (val !== grid[r][c]) moved = true;
      next[r][c] = val;
      const m = mRev[SIZE - 1 - c];
      if (m) {
        animMeta[r][c] = {
          sources: m.sources.map((revCol) => [r, SIZE - 1 - revCol]),
          merged: m.merged,
        };
      }
    }
  }
  return { grid: next, moved, scoreAdd, animMeta };
}

function moveUpWithMeta(grid) {
  const t = transpose(grid);
  const { grid: nt, moved, scoreAdd, animMeta: amT } = moveLeftWithMeta(t);
  const next = transpose(nt);
  const animMeta = emptyAnimGrid();
  for (let ti = 0; ti < SIZE; ti++) {
    for (let tout = 0; tout < SIZE; tout++) {
      const m = amT[ti][tout];
      if (!m) continue;
      const r = tout;
      const c = ti;
      animMeta[r][c] = {
        sources: m.sources.map(([tRow, tCol]) => [tCol, tRow]),
        merged: m.merged,
      };
    }
  }
  return { grid: next, moved, scoreAdd, animMeta };
}

function moveDownWithMeta(grid) {
  const t = transpose(grid);
  const { grid: nt, moved, scoreAdd, animMeta: amT } = moveRightWithMeta(t);
  const next = transpose(nt);
  const animMeta = emptyAnimGrid();
  for (let ti = 0; ti < SIZE; ti++) {
    for (let tout = 0; tout < SIZE; tout++) {
      const m = amT[ti][tout];
      if (!m) continue;
      const r = tout;
      const c = ti;
      animMeta[r][c] = {
        sources: m.sources.map(([tRow, tCol]) => [tCol, tRow]),
        merged: m.merged,
      };
    }
  }
  return { grid: next, moved, scoreAdd, animMeta };
}

function applyMoveWithMeta(grid, dir) {
  if (dir === "left") return moveLeftWithMeta(grid);
  if (dir === "right") return moveRightWithMeta(grid);
  if (dir === "up") return moveUpWithMeta(grid);
  return moveDownWithMeta(grid);
}

function applyMove(grid, dir) {
  const r = applyMoveWithMeta(grid, dir);
  return { grid: r.grid, moved: r.moved, scoreAdd: r.scoreAdd };
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

function averageRect(rects) {
  if (rects.length === 0) return null;
  if (rects.length === 1) return rects[0];
  const cx = rects.reduce((s, r) => s + r.left + r.width / 2, 0) / rects.length;
  const cy = rects.reduce((s, r) => s + r.top + r.height / 2, 0) / rects.length;
  const w = rects[0].width;
  const h = rects[0].height;
  return {
    left: cx - w / 2,
    top: cy - h / 2,
    width: w,
    height: h,
  };
}

function captureTileRects(container, gr) {
  const wrap = container.querySelector(".g2048-grid");
  if (!wrap) return {};
  const cells = wrap.querySelectorAll(".g2048-cell");
  const rects = {};
  let idx = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (gr[r][c] !== 0) {
        const tile = cells[idx]?.querySelector(".g2048-tile");
        if (tile) rects[`${r},${c}`] = tile.getBoundingClientRect();
      }
      idx++;
    }
  }
  return rects;
}

export function createGame2048(container, { onScore, onBest, onWin, onLose }) {
  let grid = emptyGrid();
  let score = 0;
  let wonShown = false;
  let gameOver = false;
  let slideLock = false;
  let motionOk = typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function tileClass(v) {
    if (v === 0) return "g2048-tile--empty";
    const known = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
    if (known.includes(v)) return `g2048-tile--n${v}`;
    return "g2048-tile--nbig";
  }

  function buildDom() {
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

  function render() {
    buildDom();
  }

  function runSlideAnimations(oldRects, animMeta, spawnRC) {
    const wrap = container.querySelector(".g2048-grid");
    if (!wrap) return;

    const cells = wrap.querySelectorAll(".g2048-cell");
    let idx = 0;
    const tasks = [];

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c];
        const tile = cells[idx]?.querySelector(".g2048-tile");
        idx++;
        if (!tile || v === 0) continue;

        const isSpawn =
          spawnRC && spawnRC[0] === r && spawnRC[1] === c;
        const meta = animMeta[r][c];
        const last = tile.getBoundingClientRect();

        if (isSpawn) {
          tile.classList.add("g2048-tile--spawn");
          tile.addEventListener(
            "animationend",
            () => tile.classList.remove("g2048-tile--spawn"),
            { once: true },
          );
          continue;
        }

        if (!meta) continue;

        const sourceRects = meta.sources
          .map(([sr, sc]) => oldRects[`${sr},${sc}`])
          .filter(Boolean);
        if (sourceRects.length === 0) continue;

        const first = averageRect(sourceRects);
        const dx = first.left - last.left;
        const dy = first.top - last.top;

        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          if (meta.merged) {
            tile.classList.add("g2048-tile--merge-pop");
            tile.addEventListener(
              "animationend",
              () => tile.classList.remove("g2048-tile--merge-pop"),
              { once: true },
            );
          }
          continue;
        }

        tile.style.transition = "none";
        tile.style.transform = `translate(${dx}px, ${dy}px)`;
        tasks.push({ tile, merged: meta.merged });
      }
    }

    if (tasks.length === 0) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const { tile, merged } of tasks) {
          tile.classList.add("g2048-tile--sliding");
          tile.style.transition = `transform ${SLIDE_MS}ms ${SLIDE_EASING}`;
          tile.style.transform = "";
          const t = tile;
          const m = merged;
          tile.addEventListener(
            "transitionend",
            (ev) => {
              if (ev.propertyName !== "transform") return;
              t.classList.remove("g2048-tile--sliding");
              t.style.transition = "";
              t.style.transform = "";
              if (m) {
                t.classList.add("g2048-tile--merge-pop");
                t.addEventListener(
                  "animationend",
                  () => t.classList.remove("g2048-tile--merge-pop"),
                  { once: true },
                );
              }
            },
            { once: true },
          );
        }
      });
    });
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
    slideLock = false;
    addTile(grid);
    addTile(grid);
    syncHud();
    render();
  }

  function input(dir) {
    if (gameOver || slideLock) return;

    const oldRects = motionOk ? captureTileRects(container, grid) : {};
    const { grid: next, moved, scoreAdd, animMeta } = applyMoveWithMeta(grid, dir);
    if (!moved) return;

    grid = next;
    score += scoreAdd;
    const spawnRC = addTile(grid);
    syncHud();

    if (motionOk && Object.keys(oldRects).length > 0) {
      buildDom();
      slideLock = true;
      runSlideAnimations(oldRects, animMeta, spawnRC);
      window.setTimeout(() => {
        slideLock = false;
      }, SLIDE_MS + 280);
    } else {
      render();
    }

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
