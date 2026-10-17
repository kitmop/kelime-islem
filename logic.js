/* Pure game logic: word racks, dictionary lookup, number rounds and solvers. */
(function (root) {
  'use strict';

  const ALPHABET = 'abcçdefgğhıijklmnoöprsştuüvyz'.split('');
  const VOWELS = new Set('aeıioöuü'.split(''));
  const IDX = {};
  ALPHABET.forEach((c, i) => { IDX[c] = i; });

  // Approximate letter frequencies of Turkish text (per mille).
  const FREQ = {
    a: 119, b: 28, c: 10, 'ç': 12, d: 47, e: 90, f: 4, g: 11, 'ğ': 11, h: 11,
    'ı': 51, i: 86, j: 1, k: 47, l: 59, m: 37, n: 75, o: 25, 'ö': 8, p: 9,
    r: 69, s: 30, 'ş': 18, t: 33, u: 32, 'ü': 20, v: 10, y: 34, z: 15,
  };

  const MIN_WORD = 5;
  const LARGE_NUMBERS = [25, 50, 60, 75, 100];

  let WORDS = [];
  let WORD_SET = new Set();
  let VECS = null;

  function init(wordsStr) {
    WORDS = wordsStr.split(' ').filter((w) => w.length >= MIN_WORD);
    WORD_SET = new Set(WORDS);
    VECS = new Uint8Array(WORDS.length * 29);
    WORDS.forEach((w, k) => {
      for (const ch of w) VECS[k * 29 + IDX[ch]]++;
    });
  }

  function isWord(w) { return WORD_SET.has(w); }

  function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

  /** All dictionary words buildable from `letters` plus `jokers` wildcards, longest first. */
  function solveWords(letters, jokers = 1) {
    const rv = new Uint8Array(29);
    for (const ch of letters) rv[IDX[ch]]++;
    const max = letters.length + jokers;
    const out = [];
    for (let k = 0; k < WORDS.length; k++) {
      if (WORDS[k].length > max) continue;
      let miss = 0;
      const base = k * 29;
      for (let i = 0; i < 29; i++) {
        const d = VECS[base + i] - rv[i];
        if (d > 0) { miss += d; if (miss > jokers) break; }
      }
      if (miss <= jokers) out.push(WORDS[k]);
    }
    out.sort((a, b) => b.length - a.length);
    return out;
  }

  function randomLetter(rng) {
    let total = 0;
    for (const c of ALPHABET) total += FREQ[c];
    let r = rng() * total;
    for (const c of ALPHABET) {
      r -= FREQ[c];
      if (r < 0) return c;
    }
    return 'a';
  }

  /** 8 random letters + 1 joker, guaranteed to contain a decent word. */
  function makeRack(rng = Math.random) {
    for (let tries = 0; tries < 200; tries++) {
      const letters = [];
      while (letters.length < 8) letters.push(randomLetter(rng));
      const vowels = letters.filter((c) => VOWELS.has(c)).length;
      if (vowels < 3 || vowels > 5) continue;
      const solutions = solveWords(letters, 1);
      if (!solutions.length || solutions[0].length < 6) continue;
      // the joker always sits last
      const tiles = letters.map((ch) => ({ ch, joker: false })).concat([{ ch: '', joker: true }]);
      return { tiles, solutions };
    }
    throw new Error('could not build a rack');
  }

  function wordScore(len) {
    if (len == 9) return 15;
    return len;
   }

  /** a (op) b for the number round; null when the move is not allowed. */
  function applyOp(a, op, b) {
    switch (op) {
      case '+': return a + b;
      case '−': return a > b ? a - b : null;
      case '×': return a * b;
      case '÷': return b !== 0 && a % b === 0 ? a / b : null;
      default: return null;
    }
  }

  /**
   * Exhaustive search over all ways of combining `nums` (each used at most once,
   * + − × ÷, positive whole results only). Returns the reachable value closest to
   * `target` together with the steps that build it.
   */
  function solveNumbers(nums, target) {
    const seen = new Set();
    let bestVal = nums[0];
    let bestNode = null;
    for (const n of nums) if (Math.abs(n - target) < Math.abs(bestVal - target)) bestVal = n;
    function rec(vals, node) {
      if (bestVal === target) return;
      const key = vals.slice().sort((x, y) => x - y).join(',');
      if (seen.has(key)) return;
      seen.add(key);
      for (let i = 0; i < vals.length; i++) {
        for (let j = i + 1; j < vals.length; j++) {
          let a = vals[i];
          let b = vals[j];
          if (a < b) [a, b] = [b, a];
          const rest = vals.filter((_, k) => k !== i && k !== j);
          const moves = [['+', a + b]];
          if (a > b) moves.push(['−', a - b]);
          if (b !== 1) moves.push(['×', a * b]);
          if (b !== 1 && a % b === 0) moves.push(['÷', a / b]);
          for (const [op, r] of moves) {
            const next = { text: `${a} ${op} ${b} = ${r}`, prev: node };
            if (Math.abs(r - target) < Math.abs(bestVal - target)) { bestVal = r; bestNode = next; }
            if (rest.length) rec(rest.concat(r), next);
          }
        }
      }
    }
    rec(nums, null);
    return { value: bestVal, steps: stepsOf(bestNode) };
  }

  function stepsOf(node) {
    const out = [];
    for (let n = node; n; n = n.prev) out.push(n.text);
    return out.reverse();
  }

  /** One large number (listed last) + five small ones, and a random target; it may be unreachable. */
  function makeNumbers(rng = Math.random) {
    const small = [];
    const counts = {};
    while (small.length < 5) {
      const n = 1 + Math.floor(rng() * 9);
      counts[n] = (counts[n] || 0) + 1;
      if (counts[n] > 2) continue;
      small.push(n);
    }
    const nums = small.concat(pick(LARGE_NUMBERS, rng));
    const target = 100 + Math.floor(rng() * 900);
    const best = solveNumbers(nums, target);
    return { nums, target, best };
  }

  /** 9 for an exact hit, one point less per step away, never below 1. */
  function numberScore(diff) {
    return Math.max(0, 9 - diff);
  }

  const api = {
    ALPHABET, VOWELS, MIN_WORD, init, isWord, solveWords, makeRack, wordScore,
    applyOp, solveNumbers, makeNumbers, numberScore,
  };
  root.KI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
