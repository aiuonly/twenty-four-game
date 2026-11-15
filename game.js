(() => {
  'use strict';

  const G = window.Game24;
  if (!G) {
    console.error('缺少 solver.js，游戏无法启动。');
    return;
  }

  const { F, OP_FNS, LEVELS, generatePuzzle } = G;

  const STORAGE_KEY = 'game24-kids-v1';
  const HELP_SEEN_KEY = 'game24-kids-help-seen-v1';
  const DEFAULT_TIP = '先点一张数字卡片，再选符号，然后点另一张卡片';
  const FRUITS = ['🍓', '🍊', '🍋', '🍇', '🍎', '🍑', '🫐', '🍉', '🍐', '🍒', '🥝', '🍍'];
  const CONFETTI = ['⭐', '✨', '🎉', '🎈', '💛', '💙', '💜', '🌟'];

  const HELP_HTML = `
    <h2>怎么玩 24 点？</h2>
    <ol class="rules">
      <li>点一张数字卡片，选中它。</li>
      <li>点一个符号：+ − × ÷。</li>
      <li>再点另一张卡片，两张牌就合成一张新牌。</li>
      <li>把 4 张牌合成 1 张，结果正好是 <b>24</b> 就成功啦！</li>
    </ol>
    <p class="note">每个数字都要用一次哦。算错了可以点「撤销」重来，需要帮忙就点「提示」。</p>
    <div class="modal-actions">
      <button class="btn-primary" data-close type="button">开始吧！</button>
    </div>
  `;

  const $ = (sel) => document.querySelector(sel);
  const board = $('#board');
  const tipEl = $('#tip');
  const modal = $('#modal');
  const modalBody = $('#modalBody');
  const soundBtn = $('#soundBtn');
  const streakChip = $('#streakChip');

  const loadPrefs = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  };

  const state = {
    level: 'easy',
    cards: [],
    sel: null,
    op: null,
    history: [],
    puzzle: null,
    hintsUsed: 0,
    done: false,
    muted: false,
    solved: 0,
    streak: 0,
  };

  let nextCardId = 1;
  let audioCtx = null;
  let lastFocused = null;

  const prefs = loadPrefs();
  if (LEVELS[prefs.level]) state.level = prefs.level;
  state.muted = prefs.muted === true;
  state.solved = Number.isFinite(prefs.solved) ? Math.max(0, Math.floor(prefs.solved)) : 0;

  /* ---------------- 声音 ---------------- */

  function getAudio() {
    if (state.muted) return null;
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch {
      return null;
    }
  }

  function tone(freq, duration = 0.12, delay = 0, type = 'sine', volume = 0.06) {
    const ctx = getAudio();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  const playClick = () => tone(560, 0.06, 0, 'triangle', 0.045);
  const playUndo = () => tone(340, 0.1, 0, 'triangle', 0.045);
  const playMerge = () => {
    tone(430, 0.1, 0, 'triangle', 0.05);
    tone(640, 0.12, 0.06, 'triangle', 0.05);
  };
  const playError = () => {
    tone(220, 0.12, 0, 'sawtooth', 0.03);
    tone(170, 0.16, 0.07, 'sawtooth', 0.025);
  };
  const playWin = () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.18, i * 0.11, 'sine', 0.06));
  };

  /* ---------------- 小工具 ---------------- */

  const pretty = (expr) => expr.replace(/-/g, '−');

  function setTip(text, kind = '') {
    tipEl.textContent = text;
    tipEl.className = 'tip' + (kind ? ' ' + kind : '');
  }

  function shake() {
    board.classList.remove('shake');
    void board.offsetWidth;
    board.classList.add('shake');
  }

  function savePrefs() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ level: state.level, muted: state.muted, solved: state.solved })
      );
    } catch {
      /* 隐私模式下忽略 */
    }
  }

  function updateSoundButton() {
    soundBtn.textContent = state.muted ? '🔇' : '🔊';
    const label = state.muted ? '打开声音' : '关闭声音';
    soundBtn.setAttribute('aria-label', label);
    soundBtn.title = label;
  }

  function updateLevelButtons() {
    document.querySelectorAll('.level').forEach((btn) => {
      const active = btn.dataset.level === state.level;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function confettiBurst() {
    const layer = $('#confetti');
    layer.replaceChildren();
    for (let i = 0; i < 36; i++) {
      const s = document.createElement('span');
      s.textContent = CONFETTI[Math.floor(Math.random() * CONFETTI.length)];
      s.style.left = Math.random() * 100 + 'vw';
      s.style.fontSize = 12 + Math.random() * 18 + 'px';
      s.style.animationDelay = Math.random() * 0.5 + 's';
      s.style.animationDuration = 1.8 + Math.random() * 1.2 + 's';
      layer.appendChild(s);
      setTimeout(() => s.remove(), 3800);
    }
  }

  /* ---------------- 弹窗 ---------------- */

  function openModal(html) {
    lastFocused = document.activeElement;
    modalBody.innerHTML = html;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    const focusTarget = modalBody.querySelector('.btn-primary');
    if (focusTarget) setTimeout(() => focusTarget.focus(), 30);
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
  }

  /* ---------------- 题目与渲染 ---------------- */

  function freshCards(nums) {
    return nums.map((n) => ({
      id: nextCardId++,
      v: F.make(n),
      expr: String(n),
      simple: true,
      fruit: FRUITS[Math.floor(Math.random() * FRUITS.length)],
      justMerged: false,
    }));
  }

  function startPuzzle({ skipped = false } = {}) {
    state.puzzle = generatePuzzle(state.level);
    state.cards = freshCards(state.puzzle.nums);
    state.sel = null;
    state.op = null;
    state.history = [];
    state.hintsUsed = 0;
    state.done = false;
    if (skipped) state.streak = 0;
    setTip(DEFAULT_TIP);
    render();
  }

  function resetPuzzle() {
    if (!state.puzzle) return;
    state.cards = freshCards(state.puzzle.nums);
    state.sel = null;
    state.op = null;
    state.history = [];
    state.done = false;
    setTip('重新开始这道题，加油！');
    render();
  }

  function render() {
    board.replaceChildren();
    state.cards.forEach((card) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.id = String(card.id);
      btn.className =
        'card' +
        (state.sel === card.id ? ' selected' : '') +
        (card.justMerged ? ' pop' : '');
      const valueStr = pretty(F.str(card.v));
      btn.setAttribute('aria-label', '数字卡片 ' + valueStr);
      btn.innerHTML =
        '<span class="fruit" aria-hidden="true">' + card.fruit + '</span>' +
        '<span class="value' + (valueStr.length >= 3 ? ' small' : '') + '">' + valueStr + '</span>' +
        (card.simple
          ? ''
          : '<span class="expr">' + pretty(card.expr) + '</span>');
      board.appendChild(btn);
      card.justMerged = false;
    });

    document.querySelectorAll('.op').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.op === state.op);
    });

    $('#undoBtn').disabled = state.history.length === 0;
    $('#solvedCount').textContent = String(state.solved);
    $('#streakCount').textContent = String(state.streak);
    streakChip.hidden = state.streak <= 0;
  }

  /* ---------------- 玩法 ---------------- */

  function onCard(id) {
    if (state.done) return;

    if (state.sel === null) {
      state.sel = id;
      setTip('选好卡片啦，再点一个符号（+ − × ÷）');
      playClick();
      render();
      return;
    }

    if (state.sel === id) {
      state.sel = null;
      state.op = null;
      setTip(DEFAULT_TIP);
      render();
      return;
    }

    if (state.op === null) {
      state.sel = id;
      setTip('换了一张卡片，再点一个符号吧');
      playClick();
      render();
      return;
    }

    combine(state.sel, id, state.op);
  }

  function onOp(op) {
    if (state.done) return;

    if (state.sel === null) {
      setTip('先点一张数字卡片，再选符号哦～', 'warn');
      shake();
      playError();
      return;
    }

    state.op = state.op === op ? null : op;
    setTip(state.op ? '选择了「' + op + '」，再点另一张卡片吧' : '再选一个符号，或点另一张卡片');
    playClick();
    render();
  }

  function combine(aId, bId, op) {
    const ia = state.cards.findIndex((c) => c.id === aId);
    const ib = state.cards.findIndex((c) => c.id === bId);
    if (ia < 0 || ib < 0) return;

    const a = state.cards[ia];
    const b = state.cards[ib];
    const result = OP_FNS[op](a.v, b.v);

    if (!result) {
      setTip('不能除以 0 哦，换一张卡片试试～', 'warn');
      state.op = null;
      shake();
      playError();
      render();
      return;
    }

    state.history.push({
      cards: state.cards.map((c) => ({ ...c })),
      sel: state.sel,
      op: state.op,
    });

    const expr =
      (a.simple ? a.expr : '(' + a.expr + ')') +
      op +
      (b.simple ? b.expr : '(' + b.expr + ')');

    const merged = {
      id: nextCardId++,
      v: result,
      expr,
      simple: false,
      fruit: a.fruit,
      justMerged: true,
    };

    state.cards = state.cards.filter((c) => c.id !== aId && c.id !== bId);
    state.cards.splice(Math.min(ia, ib), 0, merged);
    state.sel = null;
    state.op = null;

    playMerge();
    render();

    if (state.cards.length === 1) {
      if (F.is24(result)) {
        win();
      } else {
        setTip(
          '只剩一张牌啦，结果是 ' + pretty(F.str(result)) + '，还不是 24。点「撤销」再试试～',
          'warn'
        );
        shake();
        playError();
      }
    } else {
      setTip('合成成功！继续凑，目标 24 分');
    }
  }

  function undo() {
    if (!state.history.length) {
      setTip('还没有可以撤销的步骤哦');
      return;
    }
    const snap = state.history.pop();
    state.cards = snap.cards.map((c) => ({ ...c, justMerged: false }));
    state.sel = snap.sel;
    state.op = snap.op;
    state.done = false;
    setTip('已撤销上一步，重新想一想～');
    playUndo();
    render();
  }

  function win() {
    state.done = true;
    state.solved += 1;
    state.streak += 1;
    state.history = [];
    savePrefs();
    render();
    playWin();
    setTimeout(confettiBurst, 160);

    const stars = state.hintsUsed === 0 ? 3 : state.hintsUsed === 1 ? 2 : 1;
    const expression = pretty(state.cards[0].expr);

    openModal(`
      <div class="win-emoji">🎉</div>
      <h2>太棒了，凑出 24！</h2>
      <div class="win-stars" aria-label="${stars} 颗星">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <p class="win-expr">${expression} = 24</p>
      <p class="win-sub">已经连续答对 <b>${state.streak}</b> 题啦</p>
      <div class="modal-actions">
        <button class="btn-primary" id="nextBtn" type="button">下一题 →</button>
        <button class="btn-ghost" data-close type="button">看看牌面</button>
      </div>
    `);
  }

  function showHint() {
    if (state.done || !state.puzzle) return;
    state.hintsUsed += 1;
    playClick();
    openModal(`
      <h2>💡 小提示</h2>
      <p class="hint-label">一种凑出 24 的方法：</p>
      <p class="win-expr">${pretty(state.puzzle.solution)} = 24</p>
      <p class="win-sub">跟着这个思路，自己动手合成一次吧！</p>
      <div class="modal-actions">
        <button class="btn-primary" data-close type="button">我来试试</button>
      </div>
    `);
  }

  /* ---------------- 事件绑定 ---------------- */

  board.addEventListener('click', (event) => {
    const btn = event.target.closest('.card');
    if (!btn) return;
    onCard(Number(btn.dataset.id));
  });

  document.querySelectorAll('.op').forEach((btn) => {
    btn.addEventListener('click', () => onOp(btn.dataset.op));
  });

  $('#undoBtn').addEventListener('click', undo);
  $('#resetBtn').addEventListener('click', resetPuzzle);
  $('#hintBtn').addEventListener('click', showHint);

  $('#newBtn').addEventListener('click', () => {
    closeModal();
    startPuzzle({ skipped: !state.done });
    playClick();
  });

  $('#levels').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-level]');
    if (!btn) return;
    const level = btn.dataset.level;
    if (!LEVELS[level] || level === state.level) return;
    state.level = level;
    state.streak = 0;
    savePrefs();
    updateLevelButtons();
    closeModal();
    startPuzzle({ skipped: true });
    setTip('难度：' + LEVELS[level].name + '，加油！');
    playClick();
  });

  $('#helpBtn').addEventListener('click', () => {
    openModal(HELP_HTML);
    playClick();
  });

  soundBtn.addEventListener('click', () => {
    state.muted = !state.muted;
    savePrefs();
    updateSoundButton();
    if (!state.muted) playClick();
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  $('#modalClose').addEventListener('click', closeModal);

  modalBody.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) {
      closeModal();
      return;
    }
    if (event.target.closest('#nextBtn')) {
      closeModal();
      startPuzzle({ skipped: false });
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  /* ---------------- 启动 ---------------- */

  updateSoundButton();
  updateLevelButtons();
  startPuzzle();

  let seenHelp = false;
  try {
    seenHelp = localStorage.getItem(HELP_SEEN_KEY) === '1';
  } catch {
    /* 忽略 */
  }
  if (!seenHelp) {
    setTimeout(() => {
      openModal(HELP_HTML);
      try {
        localStorage.setItem(HELP_SEEN_KEY, '1');
      } catch {
        /* 忽略 */
      }
    }, 400);
  }
})();
