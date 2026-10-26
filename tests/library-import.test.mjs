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
  albumArtist: 'Artista local',
  releaseId: 'release-local-1',
  trackNumber: 2,
  discNumber: 1,
  year: 2026,
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
assert.ok(Library.getCoverUrl(track).startsWith('blob:'), 'capa auxiliar não foi associada sob demanda');
assert.equal(track.lyricsFile.name, 'audio.srt');
assert.equal(track.lyrics[0].translation.text, 'Line');
assert.deepEqual(Library.getFolders()[0].tracks, ['track-stable-id']);
assert.deepEqual(Library.getAlbums().map(album => ({
  name: album.name,
  artist: album.artist,
  year: album.year,
  count: album.count,
  tracks: album.tracks.map(item => item.id)
})), [{
  name: 'Álbum local',
  artist: 'Artista local',
  year: 2026,
  count: 1,
  tracks: ['track-stable-id']
}], 'álbuns confiáveis devem expor metadados e faixas disponíveis');

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
const updatedCover = new File(['nova'], '_RVCDKS5D4c.jpg', { type: 'image/jpeg', lastModified: 3000 });
assert.equal(await Library.importFiles([nexoFiles[0], revisedLyrics, updatedCover]), true, 'reimportação da mesma faixa deve funcionar');
const afterReimport = Library.getTracks().filter(item => item.referenceId === '_RVCDKS5D4c');
assert.equal(afterReimport.length, 1, 'reimportação não pode duplicar a faixa');
assert.equal(await afterReimport[0].lyricsFile.text(), '[00:17.539]Use your heart again', 'letra atualizada não foi preservada');
assert.equal(afterReimport[0].coverFile.size, updatedCover.size, 'capa mais nova e melhor comprimida não foi atualizada');
await Library.ensureMetadata(afterReimport[0]);
assert.equal(afterReimport[0].coverFile.size, updatedCover.size, 'o enriquecimento tardio não pode restaurar a capa antiga');

const coverOnly = new File(['nova-capa-quadrada'], '_RVCDKS5D4c.webp', { type: 'image/webp', lastModified: 4000 });
assert.equal(await Library.importFiles([coverOnly]), true, 'uma capa isolada com identificador confiável deve atualizar a faixa existente');
assert.equal(afterReimport[0].coverFile.name, '_RVCDKS5D4c.webp');
assert.equal(afterReimport[0].coverFile.type, 'image/webp');
assert.equal(Library.getTracks().filter(item => item.referenceId === '_RVCDKS5D4c').length, 1, 'atualizar só a capa não pode duplicar áudio');

const unrelatedCover = new File(['errada'], '_OTHER12345.jpg', { type: 'image/jpeg', lastModified: 5000 });
assert.equal(await Library.importFiles([unrelatedCover]), false, 'nomes apenas semelhantes não podem associar uma capa a outra faixa');
assert.equal(afterReimport[0].coverFile.name, '_RVCDKS5D4c.webp');

console.log('library-import.test.mjs: importação, associação Nexo, álbuns, atualização isolada e seleção vazia passaram');
