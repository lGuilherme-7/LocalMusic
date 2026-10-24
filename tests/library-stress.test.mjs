import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { performance } from 'node:perf_hooks';

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

const sizes = [100, 386, 500, 1000, 5000];
const metrics = [];

for (const size of sizes) {
  const { default: Library } = await import(`../js/library.js?stress=${size}`);
  const files = Array.from({ length: size }, (_, index) => new File(
    [`audio-${index}`],
    `Música ${String(index).padStart(5, '0')} — João 日本語.mp3`,
    { type: 'audio/mpeg', lastModified: index + 1 }
  ));

  const importStarted = performance.now();
  assert.equal(await Library.importFiles(files), true);
  const importMs = performance.now() - importStarted;
  assert.equal(Library.getTracks().length, size);

  const aggregationStarted = performance.now();
  const stats = Library.getStats();
  const aggregationMs = performance.now() - aggregationStarted;
  assert.equal(stats.tracks, size);
  assert.equal(stats.artists, 1);
  assert.equal(stats.albums, 1);

  const enrichmentStarted = performance.now();
  await Promise.all(Library.getTracks().map(track => Library.ensureMetadata(track)));
  const enrichmentMs = performance.now() - enrichmentStarted;

  metrics.push({
    tracks: size,
    importMs: Number(importMs.toFixed(2)),
    aggregationMs: Number(aggregationMs.toFixed(2)),
    enrichmentMs: Number(enrichmentMs.toFixed(2))
  });
}

console.log('library-stress.test.mjs:', JSON.stringify(metrics));
