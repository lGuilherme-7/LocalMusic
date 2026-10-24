import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.txt', '.svg']);
const checked = [];

async function visit(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (!textExtensions.has(extname(entry.name).toLowerCase())) continue;
    const bytes = await readFile(path);
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.equal(content.includes('\uFFFD'), false, `caractere de substituição em ${relative(root, path)}`);
    checked.push(path);
  }
}

await visit(root);
assert.ok(checked.length >= 30, 'a verificação deve cobrir os arquivos textuais do projeto');

const samples = ['João', 'Beyoncé', 'Música', 'François', '日本語', '🎵'];
assert.deepEqual(JSON.parse(JSON.stringify(samples)), samples, 'nomes internacionais devem sobreviver à persistência JSON');

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /<meta charset="UTF-8">/i);
assert.match(html, /Músicas/);

console.log(`utf8.test.mjs: ${checked.length} arquivos e textos internacionais passaram`);
