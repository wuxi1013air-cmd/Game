const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

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

export function createSolitaire(rootEl, { onWin }) {
  let stock = [];
  let waste = [];
  let foundations = [[], [], [], []];
  let tableau = [[], [], [], [], [], [], []];
  let selected = null;

  function tryAutoFoundation() {
    if (!selected || selected.cards.length !== 1) {
      clearSel();
      return;
    }
    const c = selected.cards[0];
    const fi = c.suit;
    const f = foundations[fi];
    const top = f.length ? f[f.length - 1] : null;
    if (!top && c.rank === 1) {
      moveToFoundation(fi);
      return;
    }
    if (top && top.rank === c.rank - 1 && top.suit === c.suit) {
      moveToFoundation(fi);
      return;
    }
    clearSel();
  }

  function moveToFoundation(fi) {
    if (!selected || selected.cards.length !== 1) return;
    const c = selected.cards[0];
    const f = foundations[fi];
    const top = f.length ? f[f.length - 1] : null;
    if (!top && c.rank !== 1) return;
    if (top && (top.rank !== c.rank - 1 || top.suit !== c.suit)) return;
    removeFromSource();
    f.push({ ...c, faceUp: true });
    clearSel();
    afterMove();
  }

  function removeFromSource() {
    if (!selected) return;
    if (selected.from === "waste") {
      waste.pop();
    } else if (selected.from === "tableau") {
      const col = tableau[selected.col];
      col.splice(selected.start, selected.cards.length);
      const last = col[col.length - 1];
      if (last && !last.faceUp) last.faceUp = true;
    }
  }

  function clearSel() {
    selected = null;
  }

  function checkWin() {
    let n = 0;
    foundations.forEach((f) => {
      n += f.length;
    });
    if (n === 52) onWin();
  }

  function afterMove() {
    checkWin();
    render();
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

  function deal() {
    const deck = shuffle(newDeck());
    stock = deck;
    waste = [];
    foundations = [[], [], [], []];
    tableau = [[], [], [], [], [], [], []];
    selected = null;
    for (let c = 0; c < 7; c++) {
      for (let r = 0; r <= c; r++) {
        const card = stock.pop();
        card.faceUp = r === c;
        tableau[c].push(card);
      }
    }
    render();
  }

  function clickStock() {
    clearSel();
    if (stock.length > 0) {
      const c = stock.pop();
      c.faceUp = true;
      waste.push(c);
    } else if (waste.length) {
      for (let i = waste.length - 1; i >= 0; i--) {
        const c = waste[i];
        c.faceUp = false;
        stock.push(c);
      }
      waste = [];
    }
    render();
  }

  function clickWaste() {
    if (waste.length === 0) return;
    const top = waste[waste.length - 1];
    if (selected?.from === "waste") {
      clearSel();
      render();
      return;
    }
    selected = { from: "waste", cards: [top] };
    render();
  }

  function clickFoundation(fi) {
    if (!selected) return;
    if (selected.cards.length !== 1) {
      clearSel();
      render();
      return;
    }
    moveToFoundation(fi);
    render();
  }

  function clickTableau(col, index) {
    const pile = tableau[col];
    const card = pile[index];

    if (selected?.from === "waste" && selected.cards.length === 1) {
      if (canPlaceOnTableau(col, selected.cards)) {
        removeFromSource();
        tableau[col].push({ ...selected.cards[0], faceUp: true });
        clearSel();
        afterMove();
        return;
      }
    }

    if (!card.faceUp) {
      if (index === pile.length - 1 && !card.faceUp) {
        card.faceUp = true;
        clearSel();
        render();
      }
      return;
    }
    const run = pile.slice(index);
    if (!validRun(run)) return;

    if (selected) {
      if (selected.from === "tableau" && selected.col === col && selected.start === index) {
        clearSel();
        render();
        return;
      }
      if (canPlaceOnTableau(col, selected.cards) && !(selected.from === "tableau" && selected.col === col)) {
        const src = selected;
        removeFromSource();
        tableau[col].push(...src.cards.map((c) => ({ ...c, faceUp: true })));
        clearSel();
        afterMove();
        return;
      }
      if (selected.from === "tableau" && selected.col === col) {
        selected = { from: "tableau", col, start: index, cards: run };
        render();
        return;
      }
    }

    selected = { from: "tableau", col, start: index, cards: run };
    render();
  }

  function dblFoundationFromTableauOrWaste() {
    tryAutoFoundation();
    render();
  }

  function cardEl(c, opts) {
    const el = document.createElement("div");
    el.className = "sol-card";
    if (!c.faceUp) {
      el.classList.add("face-down");
      el.textContent = "";
    } else {
      el.classList.add(isRed(c.suit) ? "red" : "black");
      el.innerHTML = `<span class="sol-rank">${RANKS[c.rank]}</span><span class="sol-suit">${SUITS[c.suit]}</span>`;
    }
    if (opts?.selected) el.classList.add("selected");
    return el;
  }

  function render() {
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
      const sel = selected?.from === "waste";
      const wc = cardEl(wtop, { selected: sel });
      wc.addEventListener("click", (e) => {
        if (e.detail >= 2) return;
        clickWaste();
      });
      wc.addEventListener("dblclick", (e) => {
        e.preventDefault();
        selected = { from: "waste", cards: [wtop] };
        dblFoundationFromTableauOrWaste();
      });
      wastePile.append(wc);
    }
    sw.append(wastePile);

    topRow.append(sw);

    const foundRow = document.createElement("div");
    foundRow.className = "sol-foundations";
    for (let fi = 0; fi < 4; fi++) {
      const fp = document.createElement("div");
      fp.className = "sol-pile sol-foundation";
      const f = foundations[fi];
      if (f.length) {
        const t = f[f.length - 1];
        fp.append(cardEl(t));
      }
      fp.addEventListener("click", () => clickFoundation(fi));
      foundRow.append(fp);
    }
    topRow.append(foundRow);
    rootEl.append(topRow);

    const tab = document.createElement("div");
    tab.className = "sol-tableau";
    for (let c = 0; c < 7; c++) {
      const colEl = document.createElement("div");
      colEl.className = "sol-column";
      const pile = tableau[c];
      pile.forEach((card, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "sol-card-wrap";
        wrap.style.marginTop = idx === 0 ? "0" : "-4.2rem";
        const sel =
          selected?.from === "tableau" && selected.col === c && idx >= selected.start;
        const ce = cardEl(card, { selected: sel });
        ce.addEventListener("click", (e) => {
          e.stopPropagation();
          if (e.detail >= 2) return;
          clickTableau(c, idx);
        });
        ce.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!card.faceUp) return;
          const run = pile.slice(idx);
          if (!validRun(run)) return;
          selected = { from: "tableau", col: c, start: idx, cards: run };
          dblFoundationFromTableauOrWaste();
        });
        wrap.append(ce);
        colEl.append(wrap);
      });
      colEl.addEventListener("click", () => {
        if (selected && selected.cards.length) {
          if (canPlaceOnTableau(c, selected.cards)) {
            if (selected.from === "tableau" && selected.col === c) return;
            const src = selected;
            removeFromSource();
            tableau[c].push(...src.cards.map((x) => ({ ...x, faceUp: true })));
            clearSel();
            afterMove();
          }
        }
      });
      tab.append(colEl);
    }
    rootEl.append(tab);
  }

  deal();

  return { reset: deal };
}
