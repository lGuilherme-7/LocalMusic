# ♪ Local Music

Player de música pessoal que roda direto no navegador — sem conta, sem streaming, sem internet. Você abre uma pasta com seus arquivos de áudio e o app monta a biblioteca automaticamente.

**[▶ Abrir o app](https://lguilherme-7.github.io/LocalMusic/)**

---

## O que faz

- Lê pastas, arquivos avulsos e ZIPs locais com músicas (MP3, WAV, OGG, AAC, M4A, FLAC)
- Extrai capa, título, artista e álbum dos arquivos automaticamente
- Reconhece LRC, LRC de tradução, SRT e letras TXT; letras sincronizadas acompanham o áudio e TXT é exibido estaticamente
- Toca, pausa, avança, volta — com fila, shuffle e repeat
- Integra controles do sistema pela Media Session API quando o navegador oferece suporte
- Exibe letras por linha e destaque progressivo quando há timings por palavra/caractere
- Busca em tempo real por título, artista ou álbum
- Cria playlists e favorita músicas
- Funciona offline após a primeira visita
- Instalável como app no Android e desktop (PWA)

---

## Tecnologias

| O quê | Por quê |
|---|---|
| HTML / CSS / JS puro | Sem build, sem dependências, roda direto |
| File System Access API | Lê pasta local no Chrome/Android |
| Web Audio API | Reprodução de áudio no browser |
| jsmediatags | Extração de metadados ID3 |
| IndexedDB + localStorage | Persiste biblioteca importada, capas, letras, playlists, favoritos e preferências |
| PWA (manifest + service worker) | Instalação e uso offline |

---

## Compatibilidade

| Plataforma | Suporte |
|---|---|
| Chrome Desktop | ✅ Completo |
| Chrome Android | ✅ Completo + instalável |
| Safari iOS | ⚠️ Parcial (sem seletor de pasta nativo) |
| Firefox | ⚠️ Parcial (fallback via input) |
| Samsung Internet | ✅ Funciona bem |

---

## Estrutura

```
/
├── index.html
├── manifest.json
├── service-worker.js
├── css/
│   └── style.css
├── js/
│   ├── app.js          ← inicialização e roteamento
│   ├── library.js      ← leitura da pasta e biblioteca
│   ├── metadata.js     ← extração de ID3
│   ├── player.js       ← controle de reprodução
│   ├── queue.js        ← fila, shuffle, repeat
│   ├── search.js       ← busca em tempo real
│   ├── playlists.js    ← CRUD de playlists
│   ├── favorites.js    ← favoritos
│   ├── storage.js      ← localStorage
│   └── ui.js           ← renderização do DOM
├── assets/
│   ├── default-cover.svg
│   └── logo.svg
└── icons/
    ├── icon.svg
    ├── icon-192.png
    └── icon-512.png
```

---

## Como usar localmente

Não precisa de Node, npm ou qualquer instalação. Basta servir os arquivos estáticos:

```bash
# Python
python -m http.server 8765 --bind 127.0.0.1
```

Depois, acesse `http://localhost:8765`. O servidor fica restrito ao seu computador; não é necessário abrir portas no Firewall.

> O app não funciona abrindo o `index.html` direto como arquivo (`file://`) por restrições de segurança do browser na File System Access API.

---

## Instalar no Windows

1. Inicie o servidor local e abra `http://localhost:8765` no Chrome ou Edge.
2. Aguarde o primeiro carregamento com conexão. Em **Você**, a opção **Instalar Local Music** aparece somente quando o navegador disponibiliza o prompt nativo.
3. Se a opção não aparecer, use o menu do navegador: no Chrome, **⋮ > Instalar Local Music**; no Edge, **… > Aplicativos > Instalar este site como um aplicativo**.
4. Confirme a instalação e abra o Local Music pelo menu Iniciar ou pelo atalho criado.

A instalação usa o modo `standalone`: a janela do app não mostra abas nem barra de endereço, mas preserva os controles normais da janela do Windows. A instalação de `localhost` não cria um executável; mantenha o servidor local disponível para receber atualizações ou fazer um primeiro carregamento em um novo perfil do navegador.

## Uso offline

O Service Worker guarda apenas o shell do app (HTML, CSS, JavaScript, manifesto e ícones) e permite reabrir a interface sem rede após a primeira visita. Músicas, capas, letras, playlists e preferências continuam no armazenamento local já usado pelo app; a biblioteca musical nunca é copiada para o Cache Storage. Não limpe os dados do site se quiser preservá-la.

Os recursos de fontes, ícones e metadados que vêm de CDN são armazenados depois de serem carregados em uma visita controlada pelo Service Worker. Portanto, faça ao menos uma recarga on-line antes de depender de uma abertura totalmente off-line; sem isso, o shell e a biblioteca continuam disponíveis, mas esses recursos externos podem usar fallback.

---

## Integração

Para integração com o Nexo e o formato oficial de exportação, consulte [PROTOCOLO.md](PROTOCOLO.md).

### Importação do Nexo

Use **Importar arquivos ou ZIP** em Você para selecionar uma exportação do Nexo, ou abra a pasta que a contém. São aceitos arquivos em subpastas e nomes com espaços, acentos e colchetes.

- A letra original é identificada por arquivo LRC, SRT ou TXT com o mesmo nome-base do áudio.
- Um sufixo de idioma, como .pt-BR.lrc, é associado como tradução e nunca substitui a letra original.
- Um identificador final entre colchetes no áudio também associa letras e capas separadas. Assim, uma capa em Capas/_RVCDKS5D4c.jpg é ligada a uma faixa cujo nome termina em [_RVCDKS5D4c].
- Reimportar uma faixa atualiza letra e tradução válidas sem criar outra música. Uma capa só substitui a existente quando sua qualidade mensurável é superior.
- A biblioteca importada é armazenada localmente no navegador. Limpar manualmente os dados do site remove essa cópia.

## Letras sincronizadas premium

O player usa o tempo real do elemento de áudio como fonte de verdade. LRC tradicional e SRT continuam em modo por verso: o verso ativo recebe destaque e a lista o acompanha sem criar tempos que não existem.

Também é aceito **Enhanced LRC** com marcas por palavra no formato interoperável abaixo:

```lrc
[00:10.000]<00:10.000>Use <00:10.500>your <00:11.000>heart
[00:12.000]And not your eyes
```

Cada marca `<mm:ss.xxx>` inicia a palavra ou trecho seguinte. O preenchimento de uma palavra termina no início temporal seguinte; a última palavra sem um tempo final explícito apenas recebe destaque quando começa. Dados incompletos, sobrepostos ou inválidos retornam automaticamente ao modo por verso.

Durante a leitura, role a letra manualmente para pausar o acompanhamento. O botão **Verso atual** volta ao trecho em reprodução. O controle **A/文** mantém a tradução opcional associada por ordem somente quando confiável ou por timestamp próximo.

Para validar a sincronização por palavra, execute:

```bash
node tests/lyrics-word-sync.test.mjs
```

## Notas

- Playlists, favoritos, fila e preferências são persistidos localmente. Para bibliotecas integradas, use o `id` estável definido em `track.json`.
- A posição exata da música não é salva ao fechar — ao reabrir, a música recomeça do início.
- Os ícones Font Awesome Free vêm de uma CDN versionada. Após uma visita on-line com o service worker ativo, os recursos CORS do cdnjs passam a usar o cache; uma primeira abertura estritamente off-line não consegue obtê-los.

---

## Paleta

| Token | Valor | Uso |
|---|---|---|
| `--accent` | `#7C52F5` | Roxo principal |
| `--accent-soft` | `#A78BFF` | Destaques e ativos |
| `--highlight` | `#FF6B9D` | Favoritos e pink |
| `--bg-primary` | `#0F0F13` | Fundo escuro |
| `--text-primary` | `#F0EEFF` | Texto principal |
