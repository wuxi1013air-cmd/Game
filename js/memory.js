const SYMBOLS = ["🌟", "🎮", "🎯", "🎪", "🎨", "🎭", "🎸", "🎺"];
const PAIRS = 8;

export function createMemoryGame(boardEl, { onMoves, onPairs, onWin }) {
  let cards = [];
  let flipped = [];
  let moves = 0;
  let matched = 0;
  let lock = false;

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function render() {
    boardEl.innerHTML = "";
    cards.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "memory-cell";
      btn.dataset.index = String(i);
      if (c.matched) btn.classList.add("matched");
      if (c.faceUp) btn.classList.add("flipped");

      const inner = document.createElement("span");
      inner.className = "memory-cell-inner";

      const back = document.createElement("span");
      back.className = "memory-face back";
      back.textContent = "?";

      const front = document.createElement("span");
      front.className = "memory-face front";
      front.textContent = c.symbol;
      front.setAttribute("aria-hidden", "true");

      inner.append(back, front);
      btn.append(inner);
      btn.addEventListener("click", () => onCellClick(i));
      boardEl.append(btn);
    });
  }

  function onCellClick(index) {
    const c = cards[index];
    if (lock || c.matched || c.faceUp) return;
    c.faceUp = true;
    flipped.push(index);
    render();

    if (flipped.length < 2) return;

    lock = true;
    moves += 1;
    onMoves(moves);

    const [a, b] = flipped;
    if (cards[a].symbol === cards[b].symbol) {
      cards[a].matched = true;
      cards[b].matched = true;
      matched += 1;
      onPairs(matched, PAIRS);
      flipped = [];
      lock = false;
      render();
      if (matched === PAIRS) onWin(moves);
    } else {
      setTimeout(() => {
        cards[a].faceUp = false;
        cards[b].faceUp = false;
        flipped = [];
        lock = false;
        render();
      }, 650);
    }
  }

  function reset() {
    const deck = shuffle([...SYMBOLS.slice(0, PAIRS), ...SYMBOLS.slice(0, PAIRS)]);
    cards = deck.map((symbol) => ({ symbol, faceUp: false, matched: false }));
    flipped = [];
    moves = 0;
    matched = 0;
    lock = false;
    onMoves(0);
    onPairs(0, PAIRS);
    render();
  }

  reset();

  return { reset };
}
