import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = await mkdtemp(join(tmpdir(), 'local-music-sw-edge-'));
const debuggingPort = 9340;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let phase = 'startup-broken';
let failedAssetRequests = 0;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8'
};

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    if (relativePath.includes('..')) {
      response.writeHead(400).end();
      return;
    }
    if (phase === 'startup-broken' && relativePath === 'js/app.js') {
      response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('falha de módulo simulada');
      return;
    }
    if (phase === 'audit-broken' && relativePath === 'js/player.js') {
      failedAssetRequests += 1;
      response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('falha simulada');
      return;
    }
    let body = await readFile(join(projectRoot, relativePath));
    if (relativePath === 'service-worker.js') {
      const cachePhase = phase === 'audit-same-version' ? 'audit-b' : phase;
      body = Buffer.from(
        body.toString('utf8').replace('local-music-shell-v17', `local-music-shell-${cachePhase}`)
          + `\n// fase de teste: ${phase}\n`,
        'utf8'
      );
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': contentTypes[extname(relativePath)] || 'application/octet-stream'
    }).end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('não encontrado');
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const serverPort = server.address().port;
const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--disable-extensions',
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

async function getTargets() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json`);
      if (response.ok) return response.json();
    } catch {
      // O navegador ainda está iniciando.
    }
    await delay(100);
  }
  throw new Error('Edge headless não iniciou a porta de depuração.');
}

try {
  const targets = await getTargets();
  const page = targets.find(target => target.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let sequence = 0;
  const waiting = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !waiting.has(message.id)) return;
    const pending = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    waiting.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  };
  const waitFor = async (expression, message) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        if (await evaluate(expression)) return;
      } catch {
        // Uma ativação pode recarregar e substituir o contexto JavaScript.
      }
      await delay(100);
    }
    throw new Error(message);
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/` });
  await waitFor('!document.querySelector("#startup-error").hidden', 'uma falha de módulo não exibiu recuperação');
  assert.equal(await evaluate('document.querySelector("#screen-home").classList.contains("active")'), true);

  phase = 'audit-a';
  await evaluate('document.querySelector("#startup-error button").click()');
  await waitFor('document.documentElement.dataset.appReady === "true"', 'a primeira visita não inicializou');
  await waitFor('navigator.serviceWorker.ready.then(() => true)', 'o primeiro Service Worker não ficou pronto');
  await send('Page.reload');
  await waitFor('Boolean(navigator.serviceWorker.controller)', 'o shell inicial não controlou a página');
  assert.deepEqual(await evaluate('caches.keys()'), ['local-music-shell-audit-a']);

  phase = 'audit-b';
  await evaluate('navigator.serviceWorker.getRegistration().then(registration => registration.update()).then(() => true)')
    .catch(() => false);
  await waitFor(
    'caches.keys().then(keys => keys.length === 1 && keys[0] === "local-music-shell-audit-b")',
    'a atualização completa não substituiu atomicamente o cache'
  );
  await waitFor('document.documentElement.dataset.appReady === "true"', 'o app não recuperou a interface após a atualização');

  phase = 'audit-same-version';
  await evaluate('navigator.serviceWorker.getRegistration().then(registration => registration.update()).then(() => true)')
    .catch(() => false);
  await delay(800);
  assert.deepEqual(
    await evaluate('caches.keys()'),
    ['local-music-shell-audit-b'],
    'uma atualização sem novo nome de cache não pode alterar o shell ativo'
  );

  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0
  });
  await send('Page.reload');
  await waitFor('document.documentElement.dataset.appReady === "true"', 'o shell atualizado não reabriu offline');
  assert.equal(await evaluate('fetch("./manifest.json").then(response => response.ok)'), true);
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1
  });

  phase = 'audit-broken';
  await evaluate('navigator.serviceWorker.getRegistration().then(registration => registration.update()).then(() => true)')
    .catch(() => false);
  await delay(1200);
  assert.ok(failedAssetRequests > 0, 'a falha de pré-cache simulada não foi exercitada');
  assert.deepEqual(
    await evaluate('caches.keys()'),
    ['local-music-shell-audit-b'],
    'uma atualização interrompida não pode deixar cache parcial nem remover o shell ativo'
  );
  assert.equal(await evaluate('document.documentElement.dataset.appReady === "true"'), true);

  socket.close();
  console.log('service-worker-browser.test.mjs: falha inicial visível, instalação, atualização atômica, offline e interrupção passaram');
} finally {
  browser.kill();
  await new Promise(resolve => server.close(resolve));
  await delay(350);
  await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
