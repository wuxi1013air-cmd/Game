const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const SCORE_FOUNDATION = 10;
const SCORE_FLIP = 5;
const SCORE_WASTE_TO_TABLEAU = 5;
const SCORE_TABLEAU_MOVE = 3;
const SCORE_RECYCLE = -20;
const DRAG_THRESHOLD = 6;
const STACK_GAP = 28;
const BEST_KEY = "mini-arcade-solitaire-best";
const DRAG_FAN_X = 1.4;
const DRAG_FAN_ROT = 0.55;

function isRed(suit) {
  return suit === 1 || suit === 2;
}

function newDeck() {
  const d = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 1; r <= 13; r++) d.push({ suit: s, rank: r, faceUp: false });
  }
  return d;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function validRun(cards) {
  if (cards.length === 0) return false;
  for (let k = 1; k < cards.length; k++) {
    const prev = cards[k - 1];
    const cur = cards[k];
    if (isRed(prev.suit) === isRed(cur.suit)) return false;
    if (prev.rank !== cur.rank + 1) return false;
  }
  return true;
}

function bestEver() {
  return Number(localStorage.getItem(BEST_KEY)) || 0;
}

function saveBest(n) {
  localStorage.setItem(BEST_KEY, String(n));
}

export function createSolitaire(rootEl, { onWin, onScore, isScoringMode = () => false }) {
  let stock = [];
  let waste = [];
  let foundations = [[], [], [], []];
  let tableau = [[], [], [], [], [], [], []];
  let score = 0;
  let moves = 0;

  let drag = null;

  function scoringOn() {
    return Boolean(isScoringMode?.());
  }

  function emit() {
    onScore?.({ score, moves, best: bestEver() });
  }

  function addPoints(delta) {
    if (!scoringOn()) return;
    score += delta;
    emit();
  }

  function bumpMoves() {
    moves += 1;
    emit();
  }

  function canPlaceOnTableau(col, cards) {
    const pile = tableau[col];
    const bottom = cards[0];
    if (pile.length === 0) return bottom.rank === 13;
    const t = pile[pile.length - 1];
    if (!t.faceUp) return false;
    if (isRed(t.suit) === isRed(bottom.suit)) return false;
    return t.rank === bottom.rank + 1;
  }

  function canPlaceOnFoundation(fi, card) {
    if (fi !== card.suit) return false;
    const f = foundations[fi];
    const top = f.length ? f[f.length - 1] : null;
    if (!top) return card.rank === 1;
    return top.rank === card.rank - 1;
  }

  function removeSource(src) {
    if (src.from === "waste") {
      waste.pop();
    } else {
      const col = tableau[src.col];
      col.splice(src.start, src.cards.length);
      const last = col[col.length - 1];
      if (last && !last.faceUp) {
        last.faceUp = true;
        addPoints(SCORE_FLIP);
      }
    }
  }

  function applyToFoundation(fi, src) {
    if (src.cards.length !== 1) return false;
    const c = src.cards[0];
    if (!canPlaceOnFoundation(fi, c)) return false;
    removeSource(src);
    foundations[fi].push({ ...c, faceUp: true });
    addPoints(SCORE_FOUNDATION);
    bumpMoves();
    checkWin();
    render();
    return true;
  }

  function applyToTableau(col, src) {
    if (!canPlaceOnTableau(col, src.cards)) return false;
    if (src.from === "tableau" && src.col === col) return false;
    const fromWaste = src.from === "waste";
    removeSource(src);
    tableau[col].push(...src.cards.map((c) => ({ ...c, faceUp: true })));
    if (fromWaste) addPoints(SCORE_WASTE_TO_TABLEAU);
    else addPoints(SCORE_TABLEAU_MOVE);
    bumpMoves();
    checkWin();
    render();
    return true;
  }

  let gameWon = false;

  function checkWin() {
    if (gameWon) return;
    let n = 0;
    foundations.forEach((f) => {
      n += f.length;
    });
    if (n === 52) {
      gameWon = true;
      if (scoringOn()) {
        const b = bestEver();
        if (score > b) saveBest(score);
      }
      emit();
      onWin?.(scoringOn() ? score : null);
    }
  }

  function clickStock() {
    if (drag) return;
    if (stock.length > 0) {
      const c = stock.pop();
      c.faceUp = true;
      waste.push(c);
      bumpMoves();
    } else if (waste.length) {
      addPoints(SCORE_RECYCLE);
      for (let i = waste.length - 1; i >= 0; i--) {
        const c = waste[i];
        c.faceUp = false;
        stock.push(c);
      }
      waste = [];
      bumpMoves();
    }
    render();
  }

  function clickFlipLast(col, index) {
    const pile = tableau[col];
    const card = pile[index];
    if (!card.faceUp && index === pile.length - 1) {
      card.faceUp = true;
      addPoints(SCORE_FLIP);
      bumpMoves();
      render();
    }
  }

  function tryDoubleToFoundation(fromWaste, col, idx) {
    let card = null;
    if (fromWaste) {
      if (!waste.length) return;
      card = waste[waste.length - 1];
    } else {
      const pile = tableau[col];
      const run = pile.slice(idx);
      if (!validRun(run) || run.length !== 1) return;
      card = run[0];
    }
    const fi = card.suit;
    if (!canPlaceOnFoundation(fi, card)) return;
    const src = fromWaste
      ? { from: "waste", cards: [card] }
      : { from: "tableau", col, start: idx, cards: [card] };
    applyToFoundation(fi, src);
  }

  function buildCardFaceHTML(c) {
    const r = RANKS[c.rank];
    const s = SUITS[c.suit];
    const cls = isRed(c.suit) ? "red" : "black";
    return `<div class="sol-card sol-card--poker ${cls}">
      <span class="sol-poker-corner sol-poker-tl">${r}<span class="sol-poker-suit">${s}</span></span>
      <span class="sol-poker-mid">${s}</span>
      <span class="sol-poker-corner sol-poker-br">${r}<span class="sol-poker-suit">${s}</span></span>
    </div>`;
  }

  function cardEl(c) {
    const wrap = document.createElement("div");
    wrap.className = "sol-card-shell";
    if (!c.faceUp) {
      wrap.innerHTML = '<div class="sol-card sol-card--poker sol-card--back" aria-hidden="true"></div>';
    } else {
      wrap.innerHTML = buildCardFaceHTML(c);
    }
    return wrap;
  }

  function makeDragGhost(cards, clientX, clientY, offX, offY) {
    const g = document.createElement("div");
    g.className = "sol-drag-ghost";
    g.style.pointerEvents = "none";

    function applyPos(cx, cy) {
      const x = cx - offX;
      const y = cy - offY;
      g.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.05)`;
    }

    function move(cx, cy) {
      applyPos(cx, cy);
    }

    cards.forEach((c, i) => {
      const shell = document.createElement("div");
      shell.className = "sol-drag-layer";
      shell.style.top = `${i * STACK_GAP}px`;
      shell.style.transform = `translateX(${i * DRAG_FAN_X}px) rotate(${i * DRAG_FAN_ROT}deg)`;
      shell.style.zIndex = String(10 + i);
      shell.innerHTML = c.faceUp ? buildCardFaceHTML(c) : '<div class="sol-card sol-card--poker sol-card--back"></div>';
      g.append(shell);
    });

    document.body.append(g);
    applyPos(clientX, clientY);

    return { el: g, move };
  }

  function removeAllDragGhosts() {
    document.body.querySelectorAll(".sol-drag-ghost").forEach((node) => node.remove());
  }

  function findDropTargetEl(x, y) {
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      const t = el.closest?.("[data-sol-drop]");
      if (t) {
        const code = t.getAttribute("data-sol-drop");
        if (code) return { code, el: t };
      }
    }
    return null;
  }

  function startDrag(src, clientX, clientY, offX, offY, sourceEls) {
    drag = {
      src,
      offX,
      offY,
      ghost: makeDragGhost(src.cards, clientX, clientY, offX, offY),
      sourceEls,
    };
    sourceEls.forEach((el) => {
      el.style.opacity = "0.3";
    });
  }

  function endDrag() {
    if (!drag) {
      removeAllDragGhosts();
      return;
    }
    const els = drag.sourceEls || drag.pending?.sourceEls;
    if (drag.ghost?.el) drag.ghost.el.remove();
    removeAllDragGhosts();
    els?.forEach((el) => {
      if (el && el.isConnected) el.style.opacity = "";
    });
    drag = null;
  }

  function onGlobalPointerMove(e) {
    if (!drag) return;
    if (drag.pending) {
      const dx = e.clientX - drag.pending.x;
      const dy = e.clientY - drag.pending.y;
      if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        const p = drag.pending;
        drag.pending = null;
        startDrag(p.src, e.clientX, e.clientY, p.offX, p.offY, p.sourceEls);
        drag.ghost.move(e.clientX, e.clientY);
      }
      return;
    }
    e.preventDefault();
    drag.ghost.move(e.clientX, e.clientY);
  }

  function onGlobalPointerUp(e) {
    if (!drag) return;
    if (drag.pending) {
      endDrag();
      return;
    }
    const hit = findDropTargetEl(e.clientX, e.clientY);
    const src = drag.src;
    endDrag();

    if (!hit) return;

    const drop = hit.code;
    let success = false;
    if (drop.startsWith("F")) {
      const fi = Number(drop.slice(1));
      if (!Number.isNaN(fi)) success = applyToFoundation(fi, src);
    } else if (drop.startsWith("T")) {
      const col = Number(drop.slice(1));
      if (!Number.isNaN(col)) success = applyToTableau(col, src);
    }

    if (success) return;

    hit.el.classList.add("sol-drop-bad");
    window.setTimeout(() => {
      hit.el.classList.remove("sol-drop-bad");
    }, 420);
  }

  function bindDrag(cardWrap, src, sourceElsGetter) {
    const inner = cardWrap.querySelector(".sol-card-shell") || cardWrap;
    inner.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const rect = inner.getBoundingClientRect();
      const offX = e.clientX - rect.left;
      const offY = e.clientY - rect.top;
      const els = sourceElsGetter();
      drag = {
        pending: { src, offX, offY, x: e.clientX, y: e.clientY, sourceEls: els },
        ghost: null,
        sourceEls: null,
      };
      inner.setPointerCapture(e.pointerId);
      const capMove = (ev) => onGlobalPointerMove(ev);
      const cleanup = (ev) => {
        try {
          inner.releasePointerCapture(ev.pointerId);
        } catch {
          /* 已丢失捕获时可能抛错 */
        }
        inner.removeEventListener("pointermove", capMove);
        inner.removeEventListener("pointerup", capUp);
        inner.removeEventListener("pointercancel", capUp);
        inner.removeEventListener("lostpointercapture", capLost);
      };
      const capLost = () => {
        inner.removeEventListener("pointermove", capMove);
        inner.removeEventListener("pointerup", capUp);
        inner.removeEventListener("pointercancel", capUp);
        inner.removeEventListener("lostpointercapture", capLost);
        endDrag();
      };
      const capUp = (ev) => {
        cleanup(ev);
        onGlobalPointerUp(ev);
      };
      inner.addEventListener("pointermove", capMove);
      inner.addEventListener("pointerup", capUp);
      inner.addEventListener("pointercancel", capUp);
      inner.addEventListener("lostpointercapture", capLost);
    });
  }

  function deal() {
    endDrag();
    gameWon = false;
    const deck = shuffle(newDeck());
    stock = deck;
    waste = [];
    foundations = [[], [], [], []];
    tableau = [[], [], [], [], [], [], []];
    score = 0;
    moves = 0;
    for (let c = 0; c < 7; c++) {
      for (let r = 0; r <= c; r++) {
        const card = stock.pop();
        card.faceUp = r === c;
        tableau[c].push(card);
      }
    }
    emit();
    render();
  }

  function render() {
    endDrag();
    rootEl.innerHTML = "";
    rootEl.className = "solitaire";

    const topRow = document.createElement("div");
    topRow.className = "sol-top";

    const sw = document.createElement("div");
    sw.className = "sol-stock-waste";
    const stockBtn = document.createElement("button");
    stockBtn.type = "button";
    stockBtn.className = "sol-pile sol-stock";
    stockBtn.setAttribute("aria-label", "发牌堆");
    if (stock.length) stockBtn.classList.add("has-cards");
    stockBtn.addEventListener("click", () => clickStock());
    sw.append(stockBtn);

    const wastePile = document.createElement("div");
    wastePile.className = "sol-pile sol-waste";
    if (waste.length) {
      const wtop = waste[waste.length - 1];
      const wc = document.createElement("div");
      wc.className = "sol-waste-card";
      const wShell = cardEl(wtop);
      wc.append(wShell);
      if (wtop.faceUp) {
        bindDrag(wc, { from: "waste", cards: [wtop] }, () => [wc.querySelector(".sol-card-shell")]);
        wShell.addEventListener("dblclick", (e) => {
          e.preventDefault();
          tryDoubleToFoundation(true);
        });
      }
      wastePile.append(wc);
    }
    sw.append(wastePile);

    topRow.append(sw);

    const foundRow = document.createElement("div");
    foundRow.className = "sol-foundations";
    for (let fi = 0; fi < 4; fi++) {
      const fp = document.createElement("div");
      fp.className = "sol-pile sol-foundation";
      fp.dataset.solDrop = `F${fi}`;
      const f = foundations[fi];
      if (f.length) {
        const t = f[f.length - 1];
        fp.append(cardEl(t));
      }
      foundRow.append(fp);
    }
    topRow.append(foundRow);
    rootEl.append(topRow);

    const tab = document.createElement("div");
    tab.className = "sol-tableau";
    for (let c = 0; c < 7; c++) {
      const colEl = document.createElement("div");
      colEl.className = "sol-column";
      colEl.dataset.solDrop = `T${c}`;
      const pile = tableau[c];
      pile.forEach((card, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "sol-card-wrap";
        wrap.style.marginTop = idx === 0 ? "0" : `-${STACK_GAP / 16}rem`;
        const shell = cardEl(card);
        wrap.append(shell);
        if (!card.faceUp) {
          shell.addEventListener("click", (e) => {
            e.stopPropagation();
            clickFlipLast(c, idx);
          });
        } else {
          const run = pile.slice(idx);
          if (validRun(run)) {
            bindDrag(
              wrap,
              { from: "tableau", col: c, start: idx, cards: run },
              () => {
                const colEl2 = tab.children[c];
                const out = [];
                for (let j = idx; j < pile.length; j++) {
                  const w = colEl2.children[j];
                  out.push(w.querySelector(".sol-card-shell"));
                }
                return out;
              }
            );
            shell.addEventListener("dblclick", (e) => {
              e.preventDefault();
              if (run.length === 1) tryDoubleToFoundation(false, c, idx);
            });
          }
        }
        colEl.append(wrap);
      });

      if (pile.length === 0) {
        const slot = document.createElement("div");
        slot.className = "sol-tableau-slot";
        slot.dataset.solDrop = `T${c}`;
        slot.setAttribute("aria-label", "空列，仅可放置 K");
        slot.innerHTML =
          '<div class="sol-tableau-slot__felt"><span class="sol-tableau-slot__mark">K</span><span class="sol-tableau-slot__hint">空列</span></div>';
        colEl.append(slot);
      }

      tab.append(colEl);
    }
    rootEl.append(tab);
  }

  deal();

  return { reset: deal };
}
