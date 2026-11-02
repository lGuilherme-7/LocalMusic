import assert from 'node:assert/strict';

const originalCreateImageBitmap = globalThis.createImageBitmap;
const originalDocument = globalThis.document;
let decodedWidth = 800;
let decodedHeight = 800;
let decodeFailure = false;
let bitmapClosed = 0;

globalThis.createImageBitmap = async () => {
  if (decodeFailure) throw new Error('imagem corrompida');
  return {
    width: decodedWidth,
    height: decodedHeight,
    close() { bitmapClosed += 1; }
  };
};

const { default: PlaylistCovers } = await import('../js/playlist-covers.js');

const valid = new Blob(['imagem'], { type: 'image/jpeg' });
const prepared = await PlaylistCovers.prepare(valid);
assert.equal(prepared.blob, valid, 'uma imagem adequada deve preservar os bytes originais');
assert.deepEqual({ width: prepared.width, height: prepared.height, optimized: prepared.optimized }, {
  width: 800,
  height: 800,
  optimized: false
});

await assert.rejects(
  PlaylistCovers.prepare(new Blob(['texto'], { type: 'text/plain' })),
  error => error.code === 'unsupported-type'
);

decodeFailure = true;
await assert.rejects(
  PlaylistCovers.prepare(new Blob(['inválida'], { type: 'image/jpeg' })),
  error => error.code === 'invalid-image'
);
decodeFailure = false;

decodedWidth = 3200;
decodedHeight = 1600;
let drawArguments = null;
globalThis.document = {
  createElement(name) {
    assert.equal(name, 'canvas');
    return {
      width: 0,
      height: 0,
      getContext() {
        return {
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low',
          drawImage(...args) { drawArguments = args; }
        };
      },
      toBlob(callback, type) { callback(new Blob(['otimizada'], { type })); }
    };
  }
};
const resized = await PlaylistCovers.prepare(valid);
assert.deepEqual({ width: resized.width, height: resized.height, optimized: resized.optimized }, {
  width: 1600,
  height: 800,
  optimized: true
});
assert.deepEqual(drawArguments.slice(-2), [1600, 800], 'a otimização deve preservar a proporção');
assert.equal(resized.blob.type, 'image/jpeg');
assert.ok(bitmapClosed >= 2, 'bitmaps temporários devem ser liberados');

globalThis.createImageBitmap = originalCreateImageBitmap;
globalThis.document = originalDocument;

console.log('playlist-covers.test.mjs: validação, decodificação e otimização passaram');
