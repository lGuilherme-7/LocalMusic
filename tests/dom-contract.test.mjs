import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, baseCss] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../js/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../css/base.css', import.meta.url), 'utf8')
]);

const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicates = htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index);
assert.deepEqual(duplicates, [], `IDs duplicados: ${duplicates.join(', ')}`);

const referencedIds = [...app.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
const missing = [...new Set(referencedIds)].filter(id => !htmlIds.includes(id));
assert.deepEqual(missing, [], `IDs ausentes no HTML: ${missing.join(', ')}`);

assert.doesNotMatch(html, /data-tab="download"/, 'a aba Baixar deve permanecer removida');
assert.match(html, /id="mini-player"[\s\S]*<nav class="bottom-nav"/, 'o miniplayer deve vir antes da navegação');
assert.doesNotMatch(html, /id="(?:volume|sleep-timer|lyrics-mode|clear-history)"/, 'controles removidos não devem voltar ao DOM');
assert.match(html, /id="lyrics-dialog"/, 'a letra deve existir em tela fullscreen dedicada');
assert.match(html, /id="home-playlists"/, 'a Início deve expor a seção de playlists');
assert.doesNotMatch(html, /id="home-albums"/, 'Álbuns não devem permanecer na Início');
assert.match(html, /data-tab="albums"/, 'Álbuns devem continuar disponíveis em Explorar');
assert.match(html, /id="last-track" hidden/, 'Última tocada deve iniciar oculta sem histórico válido');
assert.doesNotMatch(app, /getTrackById\(Storage\.get\('lm_last_track'\)\) \|\|/, 'Última tocada não pode inventar a primeira faixa');
assert.match(html, /font-awesome\/6\.7\.2\/css\/all\.min\.css/, 'Font Awesome Free versionado deve ser carregado por CDN');
assert.doesNotMatch(html, /<svg\b/, 'ícones de interface não devem usar SVG inline');
assert.match(html, /fa-shuffle/, 'shuffle deve usar Font Awesome');
assert.match(html, /fa-repeat/, 'repeat deve usar Font Awesome');
assert.match(app, /document\.createElement\('i'\)/, 'ícones dinâmicos devem usar elementos i');
assert.match(html, /id="change-folder"[\s\S]*fa-chevron-right/, 'Trocar biblioteca deve expor um indicador visual');
assert.match(html, /id="clear-search"/, 'a busca deve ter um botão de limpeza controlado pelo app');
assert.match(baseCss, /::-webkit-search-cancel-button/, 'o botão nativo de limpeza deve ser desativado para evitar duplicação');
assert.match(app, /#playlist-overview \[data-playlist="favorites"\]/, 'o card fixo de Favoritos deve receber o listener de abertura');
const playerMarkup = html.match(/id="player-dialog"[\s\S]*?<\/dialog>/)?.[0] || '';
assert.doesNotMatch(playerMarkup, />TOCANDO AGORA</, 'o player expandido não deve exibir título redundante');

console.log('dom-contract.test.mjs: contrato DOM válido');
