import assert from 'node:assert/strict';
import { File } from 'node:buffer';

const withPath = (file, path) => {
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
};

const metadata = {
  schema: 'local-music-track',
  protocolVersion: '1.1.0',
  id: 'track-stable-id',
  title: 'Faixa de teste',
  artist: 'Artista local',
  album: 'Álbum local',
  duration: 12.5,
  audio: { path: 'audio.mp3' },
  cover: { path: 'cover.webp' },
  lyrics: { lines: [{ start: 0, end: 2, text: 'Linha', translation: { text: 'Line' } }] }
};

const files = [
  withPath(new File(['not-real-audio'], 'audio.mp3', { type: 'audio/mpeg' }), 'Biblioteca/Artista/Faixa/audio.mp3'),
  withPath(new File([JSON.stringify(metadata)], 'track.json', { type: 'application/json' }), 'Biblioteca/Artista/Faixa/track.json'),
  withPath(new File(['image'], 'cover.webp', { type: 'image/webp' }), 'Biblioteca/Artista/Faixa/cover.webp'),
  withPath(new File(['1\n00:00:00,000 --> 00:00:02,000\nLinha'], 'audio.srt', { type: 'text/plain' }), 'Biblioteca/Artista/Faixa/audio.srt')
];
let selectedFiles = files;

globalThis.window = {};
globalThis.document = {
  createElement() {
    return {
      get files() { return selectedFiles; },
      type: '',
      multiple: false,
      accept: '',
      setAttribute() {},
      click() { queueMicrotask(() => this.onchange?.()); }
    };
  }
};
globalThis.Audio = class {
  set src(_) { queueMicrotask(() => this.onerror?.()); }
};

const { default: Library } = await import('../js/library.js');
assert.equal(await Library.openFolder(), true);
const [track] = Library.getTracks();
assert.equal(track.id, 'track-stable-id');
assert.equal(track.title, 'Faixa de teste');
assert.equal(track.audio, 'audio.mp3');
assert.ok(track.cover.startsWith('blob:'), 'capa auxiliar não foi associada');
assert.equal(track.lyricsFile.name, 'audio.srt');
assert.equal(track.lyrics[0].translation.text, 'Line');
assert.deepEqual(Library.getFolders()[0].tracks, ['track-stable-id']);

selectedFiles = [];
assert.equal(await Library.openFolder(), false, 'biblioteca vazia não deve ser considerada carregada');
assert.equal(Library.getTracks().length, 1, 'uma seleção vazia não pode apagar a biblioteca já carregada');

const nexoFiles = [
  new File(['ID3audio'], 'Use Your Heart (Interlude) [_RVCDKS5D4c].mp3', { type: 'audio/mpeg', lastModified: 2000 }),
  new File(['[00:17.539]Use your heart\n[00:21.199]And not your eyes'], 'Use Your Heart (Interlude) [_RVCDKS5D4c].lrc', { type: 'text/plain', lastModified: 2000 }),
  new File(['[00:17.539]Use seu coração\n[00:21.199]E não seus olhos'], 'Use Your Heart (Interlude) [_RVCDKS5D4c].pt-BR.lrc', { type: 'text/plain', lastModified: 2000 }),
  new File(['cover-higher-quality'], '_RVCDKS5D4c.jpg', { type: 'image/jpeg', lastModified: 2000 })
];
assert.equal(await Library.importFiles(nexoFiles), true, 'arquivos do Nexo devem ser importados');
const imported = Library.getTracks().find(item => item.referenceId === '_RVCDKS5D4c');
assert.ok(imported, 'identificador entre colchetes não foi preservado');
assert.equal(imported.lyricsFile.name, 'Use Your Heart (Interlude) [_RVCDKS5D4c].lrc');
assert.equal(imported.translationFile.name, 'Use Your Heart (Interlude) [_RVCDKS5D4c].pt-BR.lrc');
assert.equal(imported.coverFile.name, '_RVCDKS5D4c.jpg');

const revisedLyrics = new File(['[00:17.539]Use your heart again'], 'Use Your Heart (Interlude) [_RVCDKS5D4c].lrc', { type: 'text/plain', lastModified: 3000 });
const highQualityCover = new File(['cover-higher-quality-with-more-bytes'], '_RVCDKS5D4c.jpg', { type: 'image/jpeg', lastModified: 3000 });
assert.equal(await Library.importFiles([nexoFiles[0], revisedLyrics, highQualityCover]), true, 'reimportação da mesma faixa deve funcionar');
const afterReimport = Library.getTracks().filter(item => item.referenceId === '_RVCDKS5D4c');
assert.equal(afterReimport.length, 1, 'reimportação não pode duplicar a faixa');
assert.equal(await afterReimport[0].lyricsFile.text(), '[00:17.539]Use your heart again', 'letra atualizada não foi preservada');
assert.equal(afterReimport[0].coverFile.size, highQualityCover.size, 'capa de qualidade comprovadamente maior não foi atualizada');

console.log('library-import.test.mjs: importação, associação Nexo, atualização e seleção vazia passaram');
