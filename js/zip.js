/**
 * Leitor de ZIP pequeno e delimitado para importações locais.
 * Usa somente APIs nativas para evitar adicionar uma dependência à PWA.
 */

const MAX_ENTRIES = 1_000;
const MAX_ENTRY_BYTES = 75 * 1024 * 1024;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;

const mimeByExtension = Object.freeze({
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  lrc: 'text/plain',
  txt: 'text/plain',
  srt: 'text/plain',
  json: 'application/json',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
});

const decoder = new TextDecoder('utf-8', { fatal: false });
const crc32Table = Uint32Array.from({ length: 256 }, (_, value) => {
  let checksum = value;
  for (let bit = 0; bit < 8; bit += 1) {
    checksum = (checksum >>> 1) ^ (0xedb88320 & -(checksum & 1));
  }
  return checksum >>> 0;
});

function crc32(bytes) {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum = (checksum >>> 8) ^ crc32Table[(checksum ^ byte) & 0xff];
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function extension(name) {
  return String(name).split('.').pop().toLowerCase();
}

function fileName(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

function normalizedPath(value) {
  const path = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!path || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return null;
  const segments = path.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null;
  return segments.join('/');
}

function findEndOfCentralDirectory(bytes) {
  const minimum = 22;
  const start = Math.max(0, bytes.length - 65_557);
  for (let index = bytes.length - minimum; index >= start; index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) return index;
  }
  return -1;
}

async function inflate(bytes, maxBytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Este navegador não oferece descompressão ZIP para esta importação.');
  }
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('O conteúdo descompactado excede o limite permitido.');
    }
    chunks.push(value);
  }
  const content = new Uint8Array(total);
  let offset = 0;
  chunks.forEach(chunk => {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return content;
}

/**
 * Extrai arquivos regulares de um ZIP sem permitir traversal de caminho.
 * São aceitos apenas os métodos store (0) e deflate (8).
 *
 * @param {File|Blob} archive
 * @returns {Promise<Array<{ file: File, path: string }>>}
 */
export async function readZipEntries(archive) {
  if (Number(archive?.size) > MAX_ARCHIVE_BYTES) throw new Error('O arquivo ZIP excede o tamanho máximo permitido.');
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) throw new Error('O arquivo não contém uma estrutura ZIP válida.');

  const entriesCount = view.getUint16(eocd + 10, true);
  const centralDirectorySize = view.getUint32(eocd + 12, true);
  const centralDirectoryOffset = view.getUint32(eocd + 16, true);
  if (entriesCount > MAX_ENTRIES) throw new Error(`O ZIP excede o limite de ${MAX_ENTRIES} arquivos.`);
  if (centralDirectoryOffset + centralDirectorySize > bytes.length) throw new Error('O diretório do ZIP está corrompido.');

  const entries = [];
  let offset = centralDirectoryOffset;
  let totalBytes = 0;

  for (let index = 0; index < entriesCount; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('Uma entrada do ZIP está corrompida.');
    }

    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const expectedChecksum = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length) throw new Error('O nome de uma entrada ZIP está corrompido.');

    const path = normalizedPath(decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength)));
    offset = end;
    if (!path) throw new Error('O ZIP contém um caminho inseguro.');
    if (path.endsWith('/')) continue;
    if (flags & 0x0001) throw new Error(`A entrada ${path} é criptografada e não pode ser importada.`);
    if (![0, 8].includes(method)) throw new Error(`A entrada ${path} usa uma compressão ZIP não suportada.`);
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`A entrada ${path} excede o tamanho máximo permitido.`);
    totalBytes += uncompressedSize;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('O conteúdo descompactado excede o limite permitido.');
    if (localHeaderOffset + 30 > bytes.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error(`O conteúdo de ${path} está corrompido.`);
    }

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > bytes.length) throw new Error(`O conteúdo de ${path} está incompleto.`);

    const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
    const content = method === 0 ? compressed : await inflate(compressed, MAX_ENTRY_BYTES);
    if (content.byteLength !== uncompressedSize || content.byteLength > MAX_ENTRY_BYTES) {
      throw new Error(`O tamanho descompactado de ${path} é inválido.`);
    }
    if (crc32(content) !== expectedChecksum) {
      throw new Error(`A verificação de integridade de ${path} falhou.`);
    }

    entries.push({
      file: new File([content], fileName(path), { type: mimeByExtension[extension(path)] || '' }),
      path
    });
  }

  return entries;
}
