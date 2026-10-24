import assert from 'node:assert/strict';
import { File } from 'node:buffer';

let nextUrl = 0;
const revoked = [];
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
URL.createObjectURL = () => `blob:test-${++nextUrl}`;
URL.revokeObjectURL = url => revoked.push(url);

try {
  const { default: Library } = await import('../js/library.js');
  const tracks = Array.from({ length: 1000 }, (_, index) => ({
    id: `cover-${index}`,
    cover: null,
    coverData: null,
    coverFile: new File([`image-${index}`], `cover-${index}.jpg`, {
      type: 'image/jpeg',
      lastModified: index
    })
  }));

  const pinnedUrl = Library.getCoverUrl(tracks[0], { pin: true });
  assert.equal(Library.getCoverUrl(tracks[0], { pin: true }), pinnedUrl, 'a mesma capa deve reutilizar sua URL');
  tracks.slice(1).forEach(track => Library.getCoverUrl(track));

  assert.equal(revoked.length, 808, 'o cache em memória deve respeitar o limite de 192 URLs');
  assert.equal(revoked.includes(pinnedUrl), false, 'a capa da música atual não pode ser expulsa do cache');
  assert.equal(tracks[0].cover, pinnedUrl);
  assert.equal(tracks[1].cover, null, 'capas antigas devem liberar sua referência temporária');

  const recreated = Library.getCoverUrl(tracks[1]);
  assert.notEqual(recreated, revoked[0], 'uma capa expulsa deve ser recriada sob demanda');
} finally {
  URL.createObjectURL = originalCreateObjectUrl;
  URL.revokeObjectURL = originalRevokeObjectUrl;
}

console.log('cover-cache.test.mjs: lazy loading, limite LRU e prioridade atual passaram');
