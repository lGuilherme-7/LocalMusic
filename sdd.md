# Local Music — Prompt Completo do Projeto

## Visão geral

Desenvolva um aplicativo de música offline chamado **Local Music**, com interface moderna, identidade visual própria e paleta de cores exclusiva baseada em tons de roxo profundo ("Violeta Noturno"). O aplicativo deve funcionar inteiramente no navegador, sem backend, sem banco de dados externo e sem frameworks JavaScript. Deve ser publicado via **GitHub Pages** e instalável como **PWA** (Progressive Web App).

O objetivo é criar um player de música pessoal onde o usuário abre uma pasta local com músicas, o app monta automaticamente a biblioteca, permite tocar, organizar em playlists, favoritar, buscar e baixar músicas do YouTube — tudo sem sair do app.

---

## Identidade visual — Violeta Noturno

A paleta de cores é o coração da identidade. Não copiar o visual de nenhum player existente.

### Tokens CSS (variáveis globais)

```css
:root {
  /* Backgrounds */
  --bg-primary: #0F0F13;
  --bg-card: #1C1B24;
  --bg-surface: #2D2B3D;
  --bg-surface-hover: #3A3850;

  /* Accent — roxo principal */
  --accent: #7C52F5;
  --accent-soft: #A78BFF;
  --accent-dim: #3D1F99;

  /* Highlight — pink para favoritos e destaques */
  --highlight: #FF6B9D;
  --highlight-soft: #E84393;

  /* Sucesso — verde apenas para estados ativos */
  --success: #22C55E;
  --success-soft: #4ADE80;

  /* Texto */
  --text-primary: #F0EEFF;
  --text-secondary: #C4BCEE;
  --text-muted: #8880AA;

  /* Bordas */
  --border: rgba(167, 139, 255, 0.12);
  --border-strong: rgba(167, 139, 255, 0.25);

  /* Modo claro (ativado via classe .light-mode no <html>) */
  --bg-primary-lt: #F5F3FF;
  --bg-card-lt: #EDE9FF;
  --bg-surface-lt: #D4C8FF;
  --text-primary-lt: #1A0A40;
  --text-secondary-lt: #4A3580;
  --text-muted-lt: #9B7FCC;
  --border-lt: rgba(107, 63, 224, 0.15);
}
```

### Tipografia

- **Display / títulos:** `Fraunces` (Google Fonts) — serifada, personalidade forte
- **Interface / corpo:** `DM Sans` (Google Fonts) — limpa, moderna, legível em mobile
- Importar via `<link>` no `<head>` do `index.html`

### Animações

- Transições suaves: `transition: all 0.2s ease`
- Entrada de elementos: `opacity 0 → 1` com `translateY(8px → 0)`
- Barra de progresso do player com `transition: width 0.1s linear`
- Ícone de música tocando: pulso suave via `@keyframes pulse`

---

## Tecnologias

- **HTML5** — estrutura única em `index.html`
- **CSS3** — arquivo único `style.css` com todas as seções comentadas
- **JavaScript puro (Vanilla JS)** — módulos ES6 separados por responsabilidade
- **File System Access API** — para leitura de pasta local (Chrome/Android)
- **Web Audio API** — para reprodução e controle de áudio
- **jsmediatags** (CDN, ~30KB) — extração de metadados ID3 de arquivos MP3
- **Cobalt.tools API** — download de músicas do YouTube em MP3
- **localStorage** — persistência de playlists, favoritos, tema, volume e nome da última música tocada (sem posição exata)
- **PWA** — manifest.json + service-worker.js para instalação e uso offline

---

## Estrutura de arquivos

```
/local-music/
│
├── index.html
├── manifest.json
├── service-worker.js
│
├── css/
│   └── style.css
│
├── js/
│   ├── app.js
│   ├── library.js
│   ├── metadata.js
│   ├── player.js
│   ├── queue.js
│   ├── search.js
│   ├── playlists.js
│   ├── favorites.js
│   ├── download.js
│   ├── storage.js
│   └── ui.js
│
├── assets/
│   ├── default-cover.svg
│   └── logo.svg
│
└── icons/
    ├── icon.svg
    ├── icon-192.png        ← gerado do SVG, obrigatório para PWA Android
    └── icon-512.png        ← gerado do SVG, obrigatório para PWA Android
```

---

## index.html — estrutura geral

O HTML contém **uma única página** com todas as telas embutidas como `<section>` com `display: none` por padrão. O JavaScript troca a tela ativa adicionando a classe `.active`. Não há redirecionamentos nem múltiplos arquivos HTML.

Estrutura interna do `<body>`:

```
<body>
  <div id="app">
    <main id="screens">
      <section id="screen-home">...</section>
      <section id="screen-explore">...</section>
      <section id="screen-playlists">...</section>
      <section id="screen-profile">...</section>
    </main>

    <div id="player-bar">...</div>

    <nav id="bottom-nav">...</nav>
  </div>

  <div id="modal-overlay">...</div>
</body>
```

O `player-bar` e o `bottom-nav` são **fixos** — sempre visíveis independente da tela ativa.

---

## style.css — organização em seção única

O CSS é um único arquivo dividido em blocos comentados com `/* === SEÇÃO === */`. Ordem das seções:

1. `/* === TOKENS === */` — variáveis CSS globais (cores, fontes, espaçamentos, bordas)
2. `/* === RESET === */` — box-sizing, margin/padding zero, fontes base
3. `/* === LAYOUT === */` — estrutura do app: flex column, main ocupa o espaço entre header e navbar
4. `/* === BOTTOM NAV === */` — navbar fixa no rodapé, 4 itens, item ativo com fundo arredondado
5. `/* === PLAYER BAR === */` — barra de reprodução fixa acima da navbar, capa + info + controles
6. `/* === TELA: HOME === */` — grid de recentes, seção "continuar ouvindo", álbuns em scroll horizontal
7. `/* === TELA: EXPLORAR === */` — input de busca fixo no topo, abas internas (Músicas / Álbuns / Artistas / Baixar)
8. `/* === TELA: PLAYLISTS === */` — lista de playlists, card de favoritos fixado no topo
9. `/* === TELA: VOCÊ === */` — avatar, nome, estatísticas, toggle de tema, opções de configuração
10. `/* === COMPONENTES === */` — cards de música, botões, inputs, badges, avatares, separadores
11. `/* === MODAIS === */` — overlay escuro, modal centralizado, modal de criar playlist
12. `/* === TEMA CLARO === */` — sobrescreve os tokens quando `html.light-mode` está ativo
13. `/* === RESPONSIVO === */` — ajustes para telas menores que 400px e maiores que 768px (tablet)
14. `/* === ANIMAÇÕES === */` — @keyframes de pulse, fade-in, slide-up

Nenhum CSS inline no HTML exceto onde estritamente necessário para valores dinâmicos via JavaScript.

---

## Telas — detalhamento

### Tela 1: Início (`#screen-home`)

Exibe um resumo da biblioteca do usuário de forma visual e acessível.

Seções internas:
- **Cabeçalho:** logo "Local Music" + ícone de notificação (decorativo)
- **Última música:** card grande com o nome da última música tocada e botão de play — sem posição exata, recomeça do início
- **Adicionadas recentemente:** scroll horizontal de cards compactos (capa + nome + artista)
- **Álbuns:** scroll horizontal de cards quadrados com capa do álbum e nome
- **Artistas:** lista compacta com avatar circular (inicial do nome) e contagem de músicas

Se a biblioteca estiver vazia, exibe um estado vazio com ilustração SVG e botão "Abrir pasta de músicas".

### Tela 2: Explorar (`#screen-explore`)

Unifica busca, biblioteca e download em uma única tela com abas internas.

Estrutura:
- **Input de busca** fixo no topo da tela — filtra em tempo real conforme o usuário digita
- **Abas internas:** `[ Músicas ] [ Álbuns ] [ Artistas ] [ Baixar ]`
  - **Músicas:** lista completa da biblioteca com ordenação (A-Z / recentes / duração)
  - **Álbuns:** grid de capas com nome do álbum e artista
  - **Artistas:** lista com contagem de faixas por artista
  - **Baixar:** campo para colar URL do YouTube + botão de download via cobalt.tools API

Quando há texto no input de busca, as abas somem e o resultado filtrado aparece diretamente.

### Tela 3: Playlists (`#screen-playlists`)

Gerencia coleções de músicas criadas pelo usuário.

Estrutura:
- **Card fixo de Favoritos** no topo — sempre presente, com contagem de faixas e ícone de coração
- **Botão "Nova playlist"** — abre modal para digitar o nome
- **Lista de playlists** — cada item mostra nome, contagem de músicas e capa gerada a partir da primeira música
- Toque em uma playlist abre a **tela de detalhe** (sobreposição interna, não uma tela nova) com lista de músicas e opção de remover faixas

### Tela 4: Você (`#screen-profile`)

Perfil pessoal e configurações do app.

Seções:
- **Avatar:** foto carregada via `<input type="file">` ou inicial do nome em círculo com gradiente roxo
- **Nome:** editável com toque, salvo no localStorage
- **Estatísticas:** cards com total de músicas, total de artistas, tempo estimado de reprodução, playlists criadas
- **Tema:** toggle switch entre modo escuro (padrão) e modo claro
- **Configurações:**
  - Trocar pasta de músicas
  - Limpar cache do app
  - Exportar playlists (JSON)
  - Importar playlists (JSON)
  - Sobre o app (versão, créditos)

---

## Player bar — detalhamento

Fixo acima da navbar. Sempre visível quando há uma música carregada.

Elementos:
- **Capa** da música (32x32px, bordas arredondadas) — toque abre o player expandido
- **Nome da música** + artista (texto truncado com ellipsis)
- **Botão anterior / play-pause / próximo**
- **Barra de progresso** fina abaixo de tudo — clicável para buscar posição
- **Indicador de tempo** discreto à direita

Ao tocar na capa ou no nome, abre o **player expandido** (modal full-screen) com:
- Capa grande centralizada com sombra colorida (`box-shadow` na cor dominante da arte)
- Nome completo e artista
- Barra de progresso larga e clicável
- Tempo atual / duração total
- Controles: shuffle, anterior, play-pause, próximo, repeat
- Controle de volume (slider)
- Botão de favorito (coração)
- Botão de adicionar à playlist

---

## JavaScript — módulos

### `app.js`
Ponto de entrada. Inicializa o app, carrega estado do localStorage, registra o service worker, conecta os módulos e define o roteamento entre telas via navbar.

### `library.js`
Gerencia a biblioteca de músicas. Usa `showDirectoryPicker()` (Chrome/Android) ou `<input webkitdirectory>` (fallback iOS/Safari) para ler a pasta selecionada recursivamente. Filtra arquivos pelos formatos aceitos (mp3, wav, ogg, aac, m4a). Monta o array global de músicas e dispara o render.

### `metadata.js`
Extrai metadados de cada arquivo de áudio usando `jsmediatags` via CDN. Obtém título, artista, álbum e capa (ArrayBuffer → base64 → data URL). Aplica fallbacks: nome do arquivo como título, "Artista desconhecido", "Álbum desconhecido" e `default-cover.svg` como capa.

### `player.js`
Controla a reprodução com a Web Audio API / HTMLAudioElement. Funções: `play()`, `pause()`, `seek(time)`, `setVolume(v)`, `next()`, `prev()`. Atualiza a interface a cada segundo via `timeupdate`. Salva estado atual no localStorage.

### `queue.js`
Gerencia a fila de reprodução. Suporta os modos: normal, repeat one, repeat all, shuffle. O shuffle embaralha uma cópia da fila sem alterar a biblioteca original.

### `search.js`
Filtragem em tempo real. Recebe o texto do input e filtra o array de músicas por título, artista e álbum usando `String.prototype.includes()` normalizado (sem acentos, lowercase). Retorna resultado ao `ui.js` para render.

### `playlists.js`
CRUD de playlists. Cria, renomeia, exclui playlists. Adiciona e remove músicas. Toda persistência passa pelo `storage.js`. Favoritos são tratados como uma playlist especial com id fixo `"favorites"`.

### `favorites.js`
Atalho para a playlist de favoritos. Funções: `toggle(trackId)`, `isFavorite(trackId)`, `getAll()`. Atualiza o ícone de coração na interface em tempo real.

### `download.js`
Integração com cobalt.tools API. Recebe a URL do YouTube colada pelo usuário, faz `fetch` para `https://api.cobalt.tools/` com o payload correto, recebe o link direto do MP3 e dispara o download via `<a download>` programático. Exibe estados: carregando, sucesso, erro.

### `storage.js`
Único ponto de acesso ao localStorage. Funções: `get(key)`, `set(key, value)`, `remove(key)`. Serializa e desserializa JSON automaticamente. Chaves usadas: `lm_favorites`, `lm_playlists`, `lm_theme`, `lm_volume`, `lm_last_track`, `lm_user_profile`.

**Importante sobre persistência:** favoritos e playlists são salvos usando o **nome do arquivo** como identificador (ex: `bohemian-rhapsody.mp3`). Funcionam corretamente enquanto o usuário não renomear nem mover os arquivos de lugar — comportamento natural para uso pessoal. A posição exata da música não é salva por ser frágil demais; ao reabrir o app a música recomeça do início.

### `ui.js`
Renderiza todos os elementos dinâmicos: lista de músicas, cards de álbuns, playlists, estado vazio, modais, toasts de notificação. Recebe dados dos outros módulos e só escreve no DOM. Nenhum outro módulo acessa o DOM diretamente.

---

## Download via cobalt.tools

Fluxo técnico dentro do app:

1. Usuário acessa aba "Baixar" na tela Explorar
2. Cola a URL do YouTube no campo de texto
3. App chama `POST https://api.cobalt.tools/` com `{ url, downloadMode: "audio", audioFormat: "mp3", audioBitrate: "128" }`
4. Resposta retorna `{ status: "tunnel" | "redirect", url: "..." }`
5. App cria um `<a href="..." download>` invisível e simula o clique
6. O MP3 é baixado direto na pasta de Downloads do dispositivo
7. Toast de confirmação: "Download concluído — mova o arquivo para sua pasta de músicas"

Sem backend, sem chave de API, sem cadastro. Funciona direto no browser.

---

## PWA — configuração

### manifest.json
```json
{
  "name": "Local Music",
  "short_name": "Local Music",
  "description": "Seu player de música pessoal",
  "start_url": "/local-music/",
  "display": "standalone",
  "background_color": "#0F0F13",
  "theme_color": "#7C52F5",
  "orientation": "portrait",
  "icons": [
    { "src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml" },
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### service-worker.js
Estratégia Cache First para assets estáticos (HTML, CSS, JS, ícones). As músicas nunca são cacheadas — ficam no dispositivo do usuário. O app funciona offline após a primeira visita.

---

## GitHub Pages — publicação

O repositório deve ter a estrutura na raiz (não em subpasta). Configurar GitHub Pages para servir da branch `main`. O `start_url` no manifest deve apontar para `/` ou para o path do repositório (`/local-music/` se o repo se chamar `local-music`).

Não são necessários arquivos de build, bundler ou dependências npm. O projeto roda direto como HTML/CSS/JS estático.

---

## Compatibilidade

| Plataforma | Funcionalidade principal | Observação |
|---|---|---|
| Chrome Desktop | 100% | File System Access API completa |
| Chrome Android | 100% | PWA instalável, pasta via picker |
| Safari iOS | 80% | Sem `showDirectoryPicker`, usa `<input webkitdirectory>` |
| Firefox | 85% | Sem File System Access API, fallback via input |
| Samsung Internet | 90% | Funciona bem como PWA |

---

## Boas práticas obrigatórias

- Todo o CSS em `style.css` — zero estilos inline no HTML
- Nenhum `console.log` no código final
- Todos os módulos JS com comentários de função no topo
- Lazy loading de metadados: extrair apenas quando a música for carregada na tela, não tudo de uma vez
- Máximo de 3 requisições externas: Google Fonts, jsmediatags CDN, cobalt.tools API
- Ícones do app em SVG — apenas os 2 PNGs obrigatórios para o manifest PWA (192px e 512px), gerados a partir do SVG
- Acessibilidade básica: `aria-label` nos botões de controle do player, `role="navigation"` na navbar