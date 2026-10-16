import assert from 'node:assert/strict';
import Lyrics from '../js/lyrics.js';

const enhanced = Lyrics.parseLrc([
  '[00:10.000]<00:10.000>Use <00:10.500>your <00:11.000>heart',
  '[00:12.000]And not your eyes'
].join('\n'));

assert.equal(enhanced.length, 2, 'Enhanced LRC deve preservar os versos');
assert.equal(enhanced[0].original, 'Use your heart');
assert.deepEqual(enhanced[0].tokens.map(token => token.start), [10, 10.5, 11]);
assert.deepEqual(enhanced[0].tokens.map(token => token.end), [10.5, 11, null]);
assert.deepEqual(enhanced[0].tokens.map(token => enhanced[0].original.slice(token.startChar, token.endChar)), ['Use', 'your', 'heart']);
assert.deepEqual(Lyrics.tokenProgresses(enhanced[0], 10.25), [.5, 0, 0]);
assert.deepEqual(Lyrics.tokenProgresses(enhanced[0], 10.75), [1, .5, 0]);
assert.deepEqual(Lyrics.tokenProgresses(enhanced[0], 11.1), [1, 1, 1], 'token sem fim explícito não deve receber duração fictícia');
assert.equal(Lyrics.activeIndex(enhanced, 11.9), 0);
assert.equal(Lyrics.activeIndex(enhanced, 12), 1);

const lineOnly = Lyrics.parseLrc('[00:02.000]Sem tempos por palavra\n[00:05.000]Segundo verso');
assert.equal(lineOnly[0].tokens.length, 0, 'LRC tradicional deve continuar no modo por verso');
assert.equal(Lyrics.activeIndex(lineOnly, 3), 0);

const invalidTokens = await Lyrics.load({ lyrics: [{
  start: 4,
  end: 8,
  text: 'Dados inválidos',
  tokens: [
    { start: 5, end: 6, startChar: 0, endChar: 5 },
    { start: 5, end: 7, startChar: 6, endChar: 14 }
  ]
}] });
assert.equal(invalidTokens[0].tokens.length, 0, 'tokens sobrepostos ou ambíguos devem cair no modo por verso');
assert.equal(Lyrics.activeIndex(invalidTokens, 6), 0, 'o verso permanece sincronizado após o fallback');

console.log('lyrics-word-sync.test.mjs: Enhanced LRC, fallback e validação passaram');
