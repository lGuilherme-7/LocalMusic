import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key)
};

const [{ default: Queue }, { default: Lyrics }, { default: Playlists }] = await Promise.all([
  import('../js/queue.js'),
  import('../js/lyrics.js'),
  import('../js/playlists.js')
]);

const tracks = ['a', 'b', 'c', 'd'].map(id => ({ id }));
Queue.set(tracks, 1);
assert.equal(Queue.current().id, 'b');
Queue.setShuffle(true);
assert.equal(Queue.current().id, 'b', 'shuffle mantém a faixa atual');
Queue.setShuffle(false);
assert.deepEqual(Queue.getQueue().map(track => track.id), ['a', 'b', 'c', 'd'], 'shuffle preserva a ordem original');
Queue.addNext(tracks[3]);
assert.equal(Queue.getQueue()[2].id, 'd');
Queue.cycleRepeat();
assert.equal(Queue.getRepeatMode(), 'repeat-all');

const lyrics = await Lyrics.load({ lyrics: [{
  start: 10,
  end: 12,
  text: 'Olá mundo',
  translation: { text: 'Hello world' },
  tokens: [{ start: 10, end: 11, startChar: 0, endChar: 3 }]
}] });
assert.equal(lyrics[0].translated, 'Hello world');
assert.equal(Lyrics.activeIndex(lyrics, 10.5), 0);
assert.ok(Lyrics.tokenProgress(lyrics[0], 10.5) > 0);

const lrc = await Lyrics.loadWithStatus({
  lyricsFile: new Blob(['[ar:Artist]\n[00:17.539]Use your heart\n[00:21.19]And not your eyes'], { type: 'text/plain' }),
  lyricsFormat: 'lrc',
  translationFile: new Blob(['[00:17.539]Use seu coração\n[00:21.19]E não seus olhos'], { type: 'text/plain' }),
  translationFormat: 'lrc'
});
assert.equal(lrc.status, 'synced');
assert.equal(lrc.lines.length, 2);
assert.equal(lrc.lines[0].start, 17.539);
assert.equal(lrc.lines[0].translated, 'Use seu coração');
assert.equal(Lyrics.activeIndex(lrc.lines, 20), 0, 'a linha LRC deve permanecer ativa até a próxima');

const textLyrics = await Lyrics.loadWithStatus({
  lyricsFile: new Blob(['Primeiro verso\n\nSegundo verso'], { type: 'text/plain' }),
  lyricsFormat: 'txt'
});
assert.equal(textLyrics.status, 'text');
assert.equal(textLyrics.lines.every(line => !line.timed), true, 'TXT não deve receber timestamps artificiais');
assert.equal(Lyrics.activeIndex(textLyrics.lines, 30), -1);

const playlist = Playlists.create('Teste');
Playlists.addTrack(playlist.id, 'a');
Playlists.addTrack(playlist.id, 'b');
Playlists.addTrack(playlist.id, 'b');
assert.equal(Playlists.moveTrack(playlist.id, 1, 0), true);
assert.deepEqual(Playlists.getById(playlist.id).tracks, ['b', 'a']);

const duplicateId = playlist.id;
memory.set('lm_playlists', JSON.stringify([
  { id: duplicateId, name: 'Primeira', tracks: ['a', 'a'] },
  { id: duplicateId, name: 'Segunda', tracks: ['b'] }
]));
const repaired = Playlists.getAll();
assert.equal(repaired.length, 2, 'playlists válidas não são descartadas durante reparo');
assert.equal(new Set(repaired.map(item => item.id)).size, 2, 'IDs duplicados são reparados na persistência');
assert.deepEqual(repaired[0].tracks, ['a'], 'faixas duplicadas são normalizadas na origem');

console.log('core.test.mjs: todos os testes passaram');
