# ♪ Local Music

Player de música pessoal que roda direto no navegador — sem conta, sem streaming, sem internet. Você abre uma pasta com seus arquivos de áudio e o app monta a biblioteca automaticamente.

**[▶ Abrir o app](https://lguilherme-7.github.io/LocalMusic/)**

---

## O que faz

- Lê uma pasta local com suas músicas (MP3, WAV, OGG, AAC, M4A, FLAC)
- Extrai capa, título, artista e álbum dos arquivos automaticamente
- Toca, pausa, avança, volta — com fila, shuffle e repeat
- Busca em tempo real por título, artista ou álbum
- Cria playlists e favorita músicas
- Baixa músicas do YouTube em MP3 (via cobalt.tools)
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
| cobalt.tools API | Download de YouTube em MP3 |
| localStorage | Persiste playlists, favoritos e preferências |
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
│   ├── download.js     ← download via cobalt.tools
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
python -m http.server 8080

# ou com Node
npx serve .
```


> O app não funciona abrindo o `index.html` direto como arquivo (`file://`) por restrições de segurança do browser na File System Access API.

---

## Notas

- Playlists e favoritos são salvos pelo **nome do arquivo** como identificador. Renomear ou mover arquivos de pasta faz o app perder o vínculo com esses itens.
- A posição exata da música não é salva ao fechar — ao reabrir, a música recomeça do início.
- O download via cobalt.tools não requer cadastro nem chave de API. O arquivo vai para a pasta de Downloads do dispositivo; depois é só mover para a pasta de músicas e reabrir a biblioteca.

---

## Paleta

| Token | Valor | Uso |
|---|---|---|
| `--accent` | `#7C52F5` | Roxo principal |
| `--accent-soft` | `#A78BFF` | Destaques e ativos |
| `--highlight` | `#FF6B9D` | Favoritos e pink |
| `--bg-primary` | `#0F0F13` | Fundo escuro |
| `--text-primary` | `#F0EEFF` | Texto principal |