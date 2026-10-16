# Local Music / Nexo Integration Protocol

## 1. Objetivo

Este documento define o contrato de integração entre **Nexo** (anteriormente Download Free), que prepara arquivos autorizados, e **Local Music**, que descobre e reproduz uma biblioteca local estática.

## 2. Responsabilidades

Nexo:

- obter os arquivos autorizados;
- gerar metadata, capa, letra existente ou transcrição e tradução;
- preparar a exportação final.

Local Music:

- descobrir músicas e carregar metadata;
- reproduzir áudio e mostrar capas;
- sincronizar letras e traduções;
- gerenciar playlists, favoritos e fila.

O Local Music não baixa músicas da internet e não requer backend.

## 3. Estrutura de uma música

Formato recomendado e suportado ao escolher uma pasta:

```text
library/
  artist/
    album/
      track/
        audio.mp3
        cover.webp
        track.json
```

`track.json` descreve o áudio no mesmo diretório. O Local Music também preserva compatibilidade com pastas de áudio sem JSON: nesse caso, lê ID3 quando disponível e aplica fallbacks.

## 4. Schema `track.json`

Obrigatórios:

| Campo | Tipo | Descrição |
|---|---|---|
| `protocolVersion` | string | Versão do protocolo (`1.0`) |
| `id` | string | ID único e estável da faixa |
| `title` | string | Título exibido |
| `artist` | string | Artista exibido |
| `duration` | number | Duração em segundos |
| `audio` | string | Caminho relativo, por exemplo `audio.mp3` |

Opcionais: `album` (string ou null), `year` (number ou null), `genre` (string ou null), `cover` (string ou null), `source` (string ou null), `language` (string ou null), `lyrics` (array), `dateAdded` (string ISO `YYYY-MM-DD`), `playCount` (number) e `lastPlayed` (string ISO ou null).

## 5. Schema da letra

Cada objeto de `lyrics` representa uma linha. Timestamps são sempre em **segundos**.

```json
{
  "start": 42.15,
  "end": 45.9,
  "original": "Texto original",
  "translated": "Texto traduzido"
}
```

`translated` é opcional. Arquivos `.srt` ao lado do áudio ainda são aceitos como compatibilidade legada, mas `lyrics` no `track.json` é a forma oficial de integração.

## 6. Fallbacks

- artista ausente: `Artista desconhecido`;
- álbum ausente: `Álbum desconhecido`;
- capa ausente: capa roxa padrão;
- letra ausente: `Letra não disponível para esta faixa.`;
- tradução ausente: `Tradução não disponível`;
- idioma ausente: não é mostrado;
- duração ausente: `0:00` até metadata estar disponível.

O Local Music nunca deve exibir `undefined`, `null` ou `NaN`.

## 7. IDs

`id` deve ser único, estável e independente do nome do arquivo. UUID v4 ou v7 é recomendado. Slugs são aceitos se unicidade e estabilidade forem garantidas. Nunca reutilize um ID para outra faixa.

## 8. Codificação

JSON e textos devem usar UTF-8.

## 9. Compatibilidade

`protocolVersion` é obrigatório. Este documento usa `1.0`. Nenhum projeto poderá realizar alteração incompatível no formato sem atualizar a versão.

### Decisões de compatibilidade do leitor

O Local Music mantém um único caminho de normalização interna e não cria dois protocolos concorrentes:

- o perfil legado `1.0` continua aceitando `audio` e `cover` como strings e `lyrics` como array;
- o perfil canônico proposto `1.1` é aceito de forma progressiva quando usa `audio.path`, `cover.path` e `lyrics.lines`;
- `original`/`translated` e `text`/`translation.text` são normalizados para a mesma representação;
- tempos permanecem em segundos; não há conversão implícita de milissegundos;
- `tokens` válidos habilitam destaque progressivo, enquanto linhas sem tokens usam sincronização por linha;
- campos desconhecidos são ignorados e arquivos auxiliares inválidos não interrompem a importação;
- `library.json`, ZIP, LRC, WebVTT e letras externas separadas continuam reservados para uma versão futura do contrato.

O identificador explícito de `track.json` tem prioridade. Sem ele, o nome do arquivo continua sendo usado para preservar favoritos e playlists legados; somente colisões dentro da mesma importação recebem o caminho relativo como identificador de segurança.

### Atualização operacional: Nexo e arquivos externos

Esta atualização substitui a reserva anterior para ZIP, LRC e letras externas. O Local Music aceita exportações do Nexo em pasta ou ZIP, inclusive quando os arquivos estão em subpastas.

- Uma letra original pode ser LRC, SRT ou TXT e é vinculada pelo mesmo nome-base do áudio.
- Um sufixo de idioma como .pt-BR identifica uma tradução opcional; ela nunca substitui nem bloqueia a letra original.
- O identificador final entre colchetes é uma chave adicional. Uma capa chamada _RVCDKS5D4c.jpg pode ficar na pasta Capas de um ZIP e ser ligada à faixa cujo nome termina em [_RVCDKS5D4c].
- LRC preserva timestamps em minutos, segundos, milissegundos ou centésimos. TXT é exibido estaticamente, sem timestamps artificiais.
- Na reimportação, ID explícito, identificador entre colchetes e caminho normalizado evitam duplicatas. O ID local anterior permanece para preservar playlists, favoritos e histórico.
- Letras válidas de igual ou melhor qualidade são atualizadas; uma letra sincronizada não é substituída por TXT. Capas só são substituídas por uma versão com qualidade mensurável superior.
- ZIPs com caminhos inseguros, entradas criptografadas, compressões desconhecidas ou conteúdo acima dos limites de segurança são recusados sem alterar itens já persistidos.

## 10. Regras de alteração

**ANTES DE ALTERAR O FORMATO DE `track.json`, `library.json`, letras ou estrutura compartilhada, LEIA ESTE ARQUIVO.**

Mudanças breaking devem alterar `protocolVersion` em versão major. Campos opcionais retrocompatíveis podem usar versão minor conforme Semantic Versioning.

## 11. Exemplo completo

```json
{
  "protocolVersion": "1.0",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "500 Miles",
  "artist": "Peter, Paul and Mary",
  "album": "The Very Best Of",
  "year": 2004,
  "genre": "Folk",
  "duration": 167,
  "audio": "audio.mp3",
  "cover": "cover.webp",
  "source": "Arquivo autorizado pelo usuário",
  "language": "en",
  "lyrics": [{ "start": 0, "end": 5, "original": "If you miss the train I'm on", "translated": "Se você perder o trem em que estou" }],
  "dateAdded": "2026-08-07",
  "playCount": 0,
  "lastPlayed": null
}
```

## 12. Fluxo

```text
Nexo
  ↓ exportação
biblioteca local
  ↓
Local Music → LibraryManager → Player
                              ├─ Lyrics
                              ├─ Queue
                              └─ Playlists
```
