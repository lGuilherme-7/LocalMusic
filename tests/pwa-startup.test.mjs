import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, worker] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../js/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../service-worker.js', import.meta.url), 'utf8')
]);

assert.match(html, /id="startup-error"[^>]*role="alert"[^>]*hidden/, 'a falha de inicialização precisa de fallback visível');
assert.match(html, /window\.__localMusicStartupFailed/, 'erros anteriores ao módulo precisam ser capturados');
assert.match(app, /init\(\)\.catch\(handleFatalStartup\)/, 'a Promise de inicialização não pode ficar sem tratamento');
assert.match(app, /registration\.update\(\)/, 'a PWA deve procurar atualizações do shell');
assert.match(app, /controllerchange/, 'uma atualização ativada deve recuperar uma página com shell misto');
assert.match(worker, /local-music-shell-v16/, 'o cache do shell precisa ser versionado após as correções');
assert.match(worker, /CACHE_COMPLETE_MARKER[\s\S]*existingCache\.match/, 'uma atualização não pode reutilizar silenciosamente o cache ativo');
assert.match(worker, /catch \(error\)[\s\S]*caches\.delete\(CACHE_NAME\)[\s\S]*throw error/, 'instalações incompletas não podem deixar um cache parcial');
assert.match(worker, /request\.mode === 'navigate'[\s\S]*shellFirst/, 'navegação deve usar o shell da versão ativa');
assert.doesNotMatch(worker, /networkFirst/, 'HTML, CSS e JavaScript não podem ser atualizados separadamente');
assert.doesNotMatch(worker, /staleWhileRevalidate/, 'JS e CSS não podem misturar versões via stale-while-revalidate');
assert.doesNotMatch(worker, /caches\.match\(/, 'consultas não devem alcançar caches de outras versões ou aplicações');
assert.match(worker, /request\.destination === 'audio'/, 'arquivos de música não devem ir para o Cache Storage');

console.log('pwa-startup.test.mjs: fallback, atualização e isolamento do cache passaram');
