/* UI and round flow. Game rules live in logic.js. */
(function () {
  'use strict';

  const L = window.KI;
  L.init(window.WORDS_STR);

  const ROUNDS = ['word', 'math', 'word', 'math'];
  const WORD_TIME = 30;
  const THINK_TIME = 30;
  const SUBMIT_TIME = 15;
  const BEST_KEY = 'kelime-islem-best';

  const $ = (s) => document.querySelector(s);
  const upper = (s) => s.toLocaleUpperCase('tr-TR');

  /* ---------- shared helpers ---------- */
  const game = { round: 0, results: [], total: 0, mode: 'start' };
  let word = null;
  let math = null;
  let timer = null;

  function show(name) {
    game.mode = name;
    for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== `screen-${name}`;
    window.scrollTo(0, 0);
  }

  function renderHeader() {
    $('#total').textContent = game.total;
    document.querySelectorAll('#dots li').forEach((li) => {
      const r = Number(li.dataset.r);
      li.classList.toggle('done', r < game.results.length);
      li.classList.toggle('active', r === game.results.length && game.mode !== 'start' && game.mode !== 'final');
    });
  }

  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  function startTimer(box, seconds, onEnd) {
    stopTimer();
    const end = Date.now() + seconds * 1000;
    const num = box.querySelector('.num');
    const bar = box.querySelector('i');
    const tick = () => {
      const left = Math.max(0, end - Date.now());
      num.textContent = Math.ceil(left / 1000);
      bar.style.width = `${(left / (seconds * 1000)) * 100}%`;
      box.classList.toggle('low', left <= 5000);
      if (left <= 0) { stopTimer(); onEnd(); }
    };
    tick();
    timer = setInterval(tick, 100);
  }

  function setMsg(el, text, kind) {
    el.textContent = text || '';
    el.className = `msg${kind ? ` ${kind}` : ''}${el.classList.contains('center') ? ' center' : ''}`;
  }

  function shake(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function loadBest() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* storage unavailable */ }
  }

  /* ---------- game flow ---------- */
  function newGame() {
    game.round = 0;
    game.results = [];
    game.total = 0;
    nextRound();
  }

  function nextRound() {
    if (game.round >= ROUNDS.length) return showFinal();
    if (ROUNDS[game.round] === 'word') startWord(); else startMath();
  }

  function finishRound(result) {
    stopTimer();
    game.results.push(result);
    game.total += result.points;
    game.round++;
    showSummary(result);
  }

  /* ---------- Kelime ---------- */
  function startWord() {
    const rack = L.makeRack();
    word = {
      tiles: rack.tiles,          // {ch, joker, as}
      chosen: [],                 // tile objects, in typed order
      solutions: rack.solutions,
      best: { word: '', pts: 0 },
      over: false,
      pending: null,              // joker tile awaiting a letter
    };
    show('word');
    renderHeader();
    setMsg($('#w-msg'), '');
    renderWord();
    startTimer($('#w-timer'), WORD_TIME, endWord);
  }

  const tileLetter = (t) => (t.joker ? t.as : t.ch);
  const currentWord = () => word.chosen.map(tileLetter).join('');

  function renderWord() {
    const answer = $('#w-answer');
    answer.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const t = word.chosen[i];
      const el = document.createElement('div');
      el.className = 'slot';
      if (t) {
        el.className += `${' filled'}${t.joker ? ' joker' : ''}`;
        el.textContent = tileLetter(t);
        el.onclick = () => removeChosen(i);
      }
      answer.appendChild(el);
    }
    const rack = $('#w-rack');
    rack.innerHTML = '';
    for (const t of word.tiles) {
      const b = document.createElement('button');
      b.className = `tile${t.joker ? ' joker' : ''}${word.chosen.includes(t) ? ' used' : ''}`;
      b.textContent = t.joker ? '★' : t.ch;
      b.setAttribute('aria-label', t.joker ? 'Joker' : t.ch);
      b.onclick = () => pressTile(t);
      rack.appendChild(b);
    }
    $('#w-best').textContent = word.best.word
      ? `En iyi: ${upper(word.best.word)} · ${word.best.pts} puan`
      : 'Henüz kelime yok';
  }

  function pressTile(t) {
    if (word.over || word.chosen.includes(t)) return;
    if (t.joker) {
      word.pending = t;
      openPicker();
      return;
    }
    word.chosen.push(t);
    setMsg($('#w-msg'), '');
    renderWord();
  }

  function removeChosen(i) {
    if (word.over) return;
    const [t] = word.chosen.splice(i, 1);
    if (t.joker) t.as = null;
    renderWord();
  }

  function typeLetter(ch) {
    if (word.over || word.chosen.length >= 9) return;
    const free = word.tiles.find((t) => !t.joker && t.ch === ch && !word.chosen.includes(t));
    if (free) { word.chosen.push(free); }
    else {
      const j = word.tiles.find((t) => t.joker && !word.chosen.includes(t));
      if (!j) { shake($('#w-answer')); return; }
      j.as = ch;
      word.chosen.push(j);
    }
    setMsg($('#w-msg'), '');
    renderWord();
  }

  function submitWord() {
    if (word.over) return;
    const w = currentWord();
    const msg = $('#w-msg');
    const answer = $('#w-answer');
    if (w.length < L.MIN_WORD) { setMsg(msg, `En az ${L.MIN_WORD} harf gerekli`, 'bad'); shake(answer); return; }
    if (!L.isWord(w)) { setMsg(msg, `“${upper(w)}” sözlükte yok`, 'bad'); shake(answer); return; }
    const pts = L.wordScore(w.length);
    if (pts > word.best.pts) word.best = { word: w, pts };
    setMsg(msg, `${upper(w)} geçerli · +${pts}`, 'good');
    answer.classList.add('ok');
    word.chosen.forEach((t) => { if (t.joker) t.as = null; });
    word.chosen = [];
    renderWord();
    setTimeout(() => answer.classList.remove('ok'), 400);
    if (w.length === 9) endWord();
  }

  function shuffleRack() {
    if (word.over) return;
    const letters = word.tiles
      .filter((t) => !t.joker)
      .map((t) => [Math.random(), t])
      .sort((a, b) => a[0] - b[0])
      .map((p) => p[1]);
    word.tiles = letters.concat(word.tiles.filter((t) => t.joker)); // joker stays last
    renderWord();
  }

  function endWord() {
    if (word.over) return;
    word.over = true;
    closePicker();
    stopTimer();
    setTimeout(() => finishRound({
      type: 'word',
      points: word.best.pts,
      answer: word.best.word,
      possible: word.solutions.slice(0, 3),
    }), 500);
  }

  /* joker letter picker */
  function openPicker() { $('#picker').hidden = false; }
  function closePicker() { $('#picker').hidden = true; if (word) word.pending = null; }

  function buildPicker() {
    const grid = $('#picker-grid');
    for (const ch of L.ALPHABET) {
      const b = document.createElement('button');
      b.textContent = ch;
      b.onclick = () => {
        const t = word.pending;
        if (t && !word.chosen.includes(t)) { t.as = ch; word.chosen.push(t); }
        closePicker();
        renderWord();
      };
      grid.appendChild(b);
    }
  }

  /* ---------- İşlem ---------- */
  function startMath() {
    const g = L.makeNumbers();
    math = {
      target: g.target,
      best: g.best,                // closest reachable value + the steps that build it
      items: g.nums.map((v, i) => ({ id: i, val: v, used: false, given: true })),
      steps: [],
      sel: null,
      op: null,
      phase: 'think',
      nextId: g.nums.length,
      over: false,
    };
    show('math');
    renderHeader();
    $('#m-think').hidden = false;
    $('#m-calc').hidden = true;
    $('#m-sub').textContent = 'Çözümü kafanda kur';
    $('#m-target').textContent = math.target;
    $('.target').classList.remove('hit');
    renderMath();
    startTimer($('#m-timer'), THINK_TIME, beginCalc);
  }

  function beginCalc() {
    if (math.over || math.phase === 'calc') return;
    math.phase = 'calc';
    $('#m-think').hidden = true;
    $('#m-calc').hidden = false;
    $('#m-sub').textContent = 'Sayılara ve işlemlere tıklayarak hesapla';
    setMsg($('#m-msg'), '');
    renderMath();
    startTimer($('#m-timer'), SUBMIT_TIME, endMath);
  }

  const closestItem = () => math.items.reduce(
    (best, it) => (Math.abs(it.val - math.target) < Math.abs(best.val - math.target) ? it : best),
    math.items[0]
  );

  function chip(it) {
    const b = document.createElement('button');
    const large = it.given && it.val >= 25;
    b.className = `chip${large ? ' big-num' : ''}${it.given ? '' : ' result'}${it.used ? ' used' : ''}`
      + `${math.sel === it.id ? ' sel' : ''}${it.val >= 10000 ? ' small-text' : ''}`
      + `${it.val === math.target ? ' hit' : ''}`;
    b.textContent = it.val;
    b.disabled = math.phase !== 'calc' || it.used || math.over;
    b.onclick = () => pickItem(it.id);
    return b;
  }

  function renderMath() {
    const given = $('#m-given');
    const results = $('#m-results');
    given.innerHTML = '';
    results.innerHTML = '';
    for (const it of math.items) (it.given ? given : results).appendChild(chip(it));
    // result tiles reuse the 6-column grid so they keep the same size
    $('#m-steps').innerHTML = math.steps.map((s) => `<li>${s.text}</li>`).join('');
    document.querySelectorAll('#m-ops .op').forEach((b) => {
      b.classList.toggle('sel', b.dataset.op === math.op);
    });
    const c = closestItem();
    const diff = Math.abs(c.val - math.target);
    $('#m-closest').textContent = math.phase === 'calc'
      ? (diff === 0 ? 'Hedefe ulaştın!' : `En yakın: ${c.val} (${diff} uzakta)`)
      : '';
    $('.target').classList.toggle('hit', diff === 0 && math.phase === 'calc');
  }

  function pickItem(id) {
    if (math.phase !== 'calc' || math.over) return;
    const it = math.items.find((x) => x.id === id);
    if (!it || it.used) return;
    if (math.sel === null) { math.sel = id; }
    else if (math.sel === id) { math.sel = null; math.op = null; }
    else if (math.op === null) { math.sel = id; }
    else { return applyMove(math.sel, math.op, id); }
    setMsg($('#m-msg'), '');
    renderMath();
  }

  function pickOp(op) {
    if (math.phase !== 'calc' || math.over) return;
    if (math.sel === null) { setMsg($('#m-msg'), 'Önce bir sayı seç', 'bad'); return; }
    math.op = math.op === op ? null : op;
    setMsg($('#m-msg'), '');
    renderMath();
  }

  function applyMove(aId, op, bId) {
    const a = math.items.find((x) => x.id === aId);
    const b = math.items.find((x) => x.id === bId);
    const r = L.applyOp(a.val, op, b.val);
    math.op = null;
    if (r === null) {
      const why = op === '−' ? 'Sonuç pozitif olmalı' : 'Bölme tam olmalı';
      setMsg($('#m-msg'), `${a.val} ${op} ${b.val}: ${why}`, 'bad');
      renderMath();
      return;
    }
    a.used = true;
    b.used = true;
    const res = { id: math.nextId++, val: r, used: false, given: false };
    math.items.push(res);
    math.steps.push({ a: a.id, b: b.id, res: res.id, text: `${a.val} ${op} ${b.val} = ${r}` });
    math.sel = res.id;
    setMsg($('#m-msg'), '');
    renderMath();
    if (r === math.target) {
      setMsg($('#m-msg'), 'Hedef tamam! 🎯', 'good');
      setTimeout(endMath, 700);
    }
  }

  function undoMove() {
    if (math.phase !== 'calc' || math.over || !math.steps.length) return;
    const s = math.steps.pop();
    math.items = math.items.filter((x) => x.id !== s.res);
    math.items.find((x) => x.id === s.a).used = false;
    math.items.find((x) => x.id === s.b).used = false;
    math.sel = null;
    math.op = null;
    setMsg($('#m-msg'), '');
    renderMath();
  }

  function resetMath() {
    while (math.steps.length) undoMove();
  }

  function endMath() {
    if (math.over) return;
    math.over = true;
    stopTimer();
    const c = closestItem();
    const diff = Math.abs(c.val - math.target);
    renderMath();
    setTimeout(() => finishRound({
      type: 'math',
      points: L.numberScore(diff),
      value: c.val,
      diff,
      target: math.target,
      best: math.best,
    }), 500);
  }

  /* ---------- summary & final ---------- */
  function showSummary(r) {
    renderHeader();
    const box = $('#summary');
    const gain = `<div class="gain${r.points ? '' : ' zero'}">+${r.points}</div>`;
    if (r.type === 'word') {
      const best = r.possible[0];
      box.innerHTML = `<div class="card"><h2>Kelime turu</h2>${gain}<dl>
        <dt>Kelimen</dt><dd class="word-big">${r.answer ? upper(r.answer) : '—'}</dd>
        <dt>En uzun mümkün</dt><dd class="word-big">${best ? `${upper(best)} (${best.length})` : '—'}</dd>
        ${r.possible.length > 1 ? `<dt>Diğerleri</dt><dd class="word-big">${r.possible.slice(1).map(upper).join(', ')}</dd>` : ''}
      </dl></div>`;
    } else {
      const status = r.diff === 0 ? 'Tam isabet!' : `${r.value} (${r.diff} uzakta)`;
      const bd = Math.abs(r.best.value - r.target);
      const bestText = bd === 0 ? 'Tam çözüm' : `En yakın: ${r.best.value} (${bd} uzakta)`;
      const steps = r.best.steps.length
        ? `<ol>${r.best.steps.map((s) => `<li>${s}</li>`).join('')}</ol>`
        : '<br>Verilen sayılardan biri';
      box.innerHTML = `<div class="card"><h2>İşlem turu</h2>${gain}<dl>
        <dt>Hedef</dt><dd>${r.target}</dd>
        <dt>Sonucun</dt><dd>${status}</dd>
        <dt>En iyi çözüm</dt><dd>${bestText}${steps}</dd>
      </dl></div>`;
    }
    $('#btn-next').textContent = game.round >= ROUNDS.length ? 'Sonucu gör' : 'Sonraki tur';
    show('summary');
  }

  function showFinal() {
    renderHeader();
    const prev = loadBest();
    const isNew = game.total > prev;
    if (isNew) saveBest(game.total);
    $('#f-total').textContent = game.total;
    $('#f-best').textContent = isNew
      ? (prev ? `Yeni rekor! (önceki: ${prev})` : 'İlk skorun kaydedildi')
      : `Rekorun: ${prev}`;
    $('#f-list').innerHTML = game.results.map((r, i) => {
      const detail = r.type === 'word'
        ? `<b>${r.answer ? upper(r.answer) : '—'}</b>`
        : `<b>${r.diff === 0 ? 'Tam' : `${r.value}`}</b>`;
      return `<li><span>Tur ${i + 1} · ${r.type === 'word' ? 'Kelime' : 'İşlem'}</span><span>${detail}<em>${r.points}</em></span></li>`;
    }).join('');
    setMsg($('#f-msg'), '');
    show('final');
  }

  function shareText() {
    const lines = game.results.map((r) => (r.type === 'word'
      ? `🔤 ${r.answer ? upper(r.answer) : '—'} · ${r.points}`
      : `🔢 ${r.diff === 0 ? 'Hedef tam' : `${r.diff} uzakta`} · ${r.points}`));
    return `Kelime & İşlem — ${game.total} puan\n${lines.join('\n')}`;
  }

  /* ---------- events ---------- */
  $('#btn-start').onclick = newGame;
  $('#btn-again').onclick = newGame;
  $('#btn-next').onclick = nextRound;
  $('#btn-share').onclick = async () => {
    try {
      await navigator.clipboard.writeText(shareText());
      setMsg($('#f-msg'), 'Kopyalandı', 'good');
    } catch (e) {
      setMsg($('#f-msg'), 'Kopyalanamadı', 'bad');
    }
  };

  $('#w-del').onclick = () => { if (word && word.chosen.length) removeChosen(word.chosen.length - 1); };
  $('#w-shuffle').onclick = shuffleRack;
  $('#w-submit').onclick = submitWord;
  $('#w-finish').onclick = endWord;
  $('#picker-cancel').onclick = closePicker;
  $('#picker').onclick = (e) => { if (e.target.id === 'picker') closePicker(); };

  $('#m-ready').onclick = beginCalc;
  $('#m-undo').onclick = undoMove;
  $('#m-reset').onclick = resetMath;
  $('#m-submit').onclick = endMath;
  document.querySelectorAll('#m-ops .op').forEach((b) => { b.onclick = () => pickOp(b.dataset.op); });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (game.mode === 'word' && word && !word.over) {
      if (!$('#picker').hidden) { if (e.key === 'Escape') closePicker(); return; }
      if (e.key === 'Enter') { e.preventDefault(); submitWord(); }
      else if (e.key === 'Backspace') { e.preventDefault(); if (word.chosen.length) removeChosen(word.chosen.length - 1); }
      else if (e.key === 'Escape') { word.chosen.forEach((t) => { t.as = null; }); word.chosen = []; renderWord(); }
      else if (e.key === ' ') { e.preventDefault(); shuffleRack(); }
      else if (e.key.length === 1) {
        // Turkish "I/İ" handling: map by the lower-case form for the Turkish locale
        const ch = e.key === 'I' ? 'ı' : e.key === 'İ' ? 'i' : e.key.toLocaleLowerCase('tr-TR');
        if (L.ALPHABET.includes(ch)) typeLetter(ch);
      }
    } else if (game.mode === 'math' && math && math.phase === 'calc' && !math.over) {
      const map = { '+': '+', '-': '−', '*': '×', x: '×', '/': '÷' };
      if (map[e.key]) pickOp(map[e.key]);
      else if (e.key === 'Backspace') undoMove();
      else if (e.key === 'Enter') { e.preventDefault(); endMath(); }
    } else if ((game.mode === 'start' || game.mode === 'summary') && e.key === 'Enter') {
      e.preventDefault();
      (game.mode === 'start' ? newGame : nextRound)();
    }
  });

  buildPicker();
  const best = loadBest();
  $('#best-line').textContent = best ? `Rekorun: ${best} puan` : '';
  renderHeader();
})();
