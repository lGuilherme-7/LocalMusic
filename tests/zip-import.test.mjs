import assert from 'node:assert/strict';
import { File } from 'node:buffer';

globalThis.File = File;

const encoder = new TextEncoder();

function bytes16(value) {
  return Uint8Array.from([value & 255, (value >>> 8) & 255]);
}

function bytes32(value) {
  return Uint8Array.from([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}

function join(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  parts.forEach(part => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function storedZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  entries.forEach(entry => {
    const name = encoder.encode(entry.name);
    const content = encoder.encode(entry.content);
    const header = join([
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), bytes16(20), bytes16(0), bytes16(0), bytes16(0), bytes16(0), bytes32(0),
      bytes32(content.length), bytes32(content.length), bytes16(name.length), bytes16(0), name, content
    ]);
    local.push(header);
    central.push(join([
      Uint8Array.from([0x50, 0x4b, 0x01, 0x02]), bytes16(20), bytes16(20), bytes16(0), bytes16(0), bytes16(0), bytes16(0),
      bytes32(0), bytes32(content.length), bytes32(content.length), bytes16(name.length), bytes16(0), bytes16(0),
      bytes16(0), bytes16(0), bytes32(0), bytes32(offset), name
    ]));
    offset += header.length;
  });
  const centralBytes = join(central);
  return join([
    ...local,
    centralBytes,
    Uint8Array.from([0x50, 0x4b, 0x05, 0x06]), bytes16(0), bytes16(0), bytes16(entries.length), bytes16(entries.length),
    bytes32(centralBytes.length), bytes32(offset), bytes16(0)
  ]);
}

const { readZipEntries } = await import('../js/zip.js');
const archive = new File([storedZip([
  { name: 'Nexo/Use Your Heart [_RVCDKS5D4c].mp3', content: 'ID3audio' },
  { name: 'Nexo/Use Your Heart [_RVCDKS5D4c].lrc', content: '[00:01.00]Verse' }
])], 'nexo.zip', { type: 'application/zip' });
const entries = await readZipEntries(archive);
assert.deepEqual(entries.map(entry => entry.path), [
  'Nexo/Use Your Heart [_RVCDKS5D4c].mp3',
  'Nexo/Use Your Heart [_RVCDKS5D4c].lrc'
]);
assert.equal(await entries[1].file.text(), '[00:01.00]Verse');

const unsafe = new File([storedZip([{ name: '../outside.mp3', content: 'ID3audio' }])], 'unsafe.zip', { type: 'application/zip' });
await assert.rejects(() => readZipEntries(unsafe), /caminho inseguro/);

globalThis.window = {};
globalThis.document = {
  createElement() {
    return { setAttribute() {}, click() {} };
  }
};
globalThis.Audio = class {
  set src(_) { queueMicrotask(() => this.onerror?.()); }
};

const { default: Library } = await import('../js/library.js');
const nexoArchive = new File([storedZip([
  { name: 'Export/Use Your Heart (Interlude) [_RVCDKS5D4c].mp3', content: 'ID3audio' },
  { name: 'Export/Use Your Heart (Interlude) [_RVCDKS5D4c].lrc', content: '[00:17.539]Use your heart' },
  { name: 'Export/Use Your Heart (Interlude) [_RVCDKS5D4c].pt-BR.lrc', content: '[00:17.539]Use seu coração' },
  { name: 'Export/Capas/_RVCDKS5D4c.jpg', content: 'cover' }
])], 'nexo-export.zip', { type: 'application/zip' });
assert.equal(await Library.importFiles([nexoArchive]), true, 'ZIP do Nexo não foi importado');
const [track] = Library.getTracks();
assert.equal(track.lyricsFile.name.endsWith('.lrc'), true);
assert.equal(track.translationFile.name.endsWith('.pt-BR.lrc'), true);
assert.equal(track.coverFile.name, '_RVCDKS5D4c.jpg');

console.log('zip-import.test.mjs: ZIP, subpastas, associação Nexo e proteção contra traversal passaram');
