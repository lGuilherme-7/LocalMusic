import assert from 'node:assert/strict';
import { File } from 'node:buffer';

globalThis.window = {};
globalThis.document = {
  createElement() {
    return { setAttribute() {}, click() {} };
  }
};
globalThis.Audio = class {
  removeAttribute() {}
  load() {}
  set src(_) {
    queueMicrotask(() => this.onerror?.());
  }
};

function withPath(file, path) {
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

function exportedTrack(folder, metadata) {
  return [
    withPath(new File(['audio'], `${metadata.id}.mp3`, { type: 'audio/mpeg' }), `${folder}/${metadata.id}.mp3`),
    withPath(new File([JSON.stringify(metadata)], 'track.json', { type: 'application/json' }), `${folder}/track.json`)
  ];
}

const files = [
  ...exportedTrack('Biblioteca/A/Disco/Faixa-2', {
    id: 'track-a2', title: 'Segunda', artist: 'Artista A', album: 'Mesmo nome',
    albumArtist: 'Artista A', releaseId: 'release-a', trackNumber: 2, year: 2024
  }),
  ...exportedTrack('Biblioteca/A/Disco/Faixa-1', {
    id: 'track-a1', title: 'Primeira', artist: 'Artista A feat. B', album: 'Mesmo nome',
    albumArtist: 'Artista A', releaseId: 'release-a', trackNumber: 1, year: 2024
  }),
  ...exportedTrack('Biblioteca/A/Edicao/Faixa-1', {
    id: 'track-a-deluxe', title: 'Faixa deluxe', artist: 'Artista A', album: 'Mesmo nome',
    albumArtist: 'Artista A', releaseId: 'release-a-deluxe', trackNumber: 1, year: 2024
  }),
  ...exportedTrack('Biblioteca/C/Disco/Faixa-1', {
    id: 'track-c1', title: 'Outra faixa', artist: 'Artista C', album: 'Mesmo nome',
    albumArtist: 'Artista C', trackNumber: 1, year: 2024
  }),
  new File(['audio-sem-album'], 'Sem álbum.mp3', { type: 'audio/mpeg' })
];

const { default: Library } = await import('../js/library.js?album-grouping');
assert.equal(await Library.importFiles(files), true);

const albums = Library.getAlbums();
assert.equal(albums.length, 3, 'álbum desconhecido deve ser omitido e edições distintas não podem ser fundidas');
const release = albums.find(album => album.releaseId === 'release-a');
assert.ok(release);
assert.equal(release.count, 2);
assert.equal(release.artist, 'Artista A');
assert.deepEqual(release.tracks.map(track => track.id), ['track-a1', 'track-a2'], 'faixas devem respeitar disco/número/título');
assert.equal(Library.getTracks().some(track => track.title === 'Sem álbum'), true, 'faixas sem álbum continuam acessíveis');

console.log('album-grouping.test.mjs: agrupamento conservador, edições, ordenação e faixa sem álbum passaram');
