/**
 * lyrics.js
 * Lê e sincroniza letras a partir de arquivos .srt (baixados junto com o
 * áudio pelo downloadFree). Não depende de nenhuma biblioteca externa —
 * parsing de SRT é feito com regex simples, e a sincronização usa o
 * próprio evento de tempo que o Player já emite (onTime).
 */

const Lyrics = (() => {

  /** Cache: File.name -> array de linhas já parseadas, para não reprocessar */
  const _cache = new Map();

  /**
   * Converte um timestamp de SRT ("00:00:20,000" ou "00:00:20.000")
   * em segundos (float).
   * @param {string} ts
   * @returns {number}
   */
  function _parseTimestamp(ts) {
    const m = ts.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) return 0;
    const [, h, min, s, ms] = m;
    return (+h) * 3600 + (+min) * 60 + (+s) + (+ms) / 1000;
  }

  /**
   * Faz o parsing de um conteúdo .srt em uma lista de linhas com tempos.
   * Tolera blocos sem número de índice e variações de quebra de linha.
   * @param {string} texto conteúdo bruto do arquivo .srt
   * @returns {Array<{inicio:number, fim:number, texto:string}>}
   */
  function _parseSrt(texto) {
    const blocos = texto.replace(/\r/g, '').trim().split(/\n\n+/);
    const linhas = [];

    for (const bloco of blocos) {
      const partes = bloco.split('\n').filter(l => l.trim() !== '');
      if (partes.length < 2) continue;

      let idx = 0;
      if (/^\d+$/.test(partes[0].trim())) idx = 1;

      const linhaTempo = partes[idx];
      if (!linhaTempo) continue;

      const matchTempo = linhaTempo.match(/([\d:,.]+)\s*-->\s*([\d:,.]+)/);
      if (!matchTempo) continue;

      const inicio = _parseTimestamp(matchTempo[1]);
      const fim    = _parseTimestamp(matchTempo[2]);
      const texto2 = partes.slice(idx + 1).join(' ').trim();

      if (texto2) linhas.push({ inicio, fim, texto: texto2 });
    }

    return linhas;
  }

  /**
   * Carrega e faz o parsing do arquivo .srt associado a uma faixa.
   * @param {File} lyricsFile arquivo .srt (track.lyricsFile do Library)
   * @returns {Promise<Array<{inicio:number, fim:number, texto:string}>>}
   */
  async function load(lyricsFile) {
    if (!lyricsFile) return [];

    const chaveCache = lyricsFile.name + '_' + lyricsFile.size;
    if (_cache.has(chaveCache)) return _cache.get(chaveCache);

    try {
      const texto  = await lyricsFile.text();
      const linhas = _parseSrt(texto);
      _cache.set(chaveCache, linhas);
      return linhas;
    } catch {
      return [];
    }
  }

  /**
   * Descobre o índice da linha atual, dado o tempo de reprodução (segundos).
   * Retorna -1 se ainda não chegou na primeira linha.
   * @param {Array<{inicio:number}>} linhas já parseadas (ver load())
   * @param {number} tempoAtual em segundos
   * @returns {number}
   */
  function indiceAtual(linhas, tempoAtual) {
    let atual = -1;
    for (let i = 0; i < linhas.length; i++) {
      if (tempoAtual >= linhas[i].inicio) atual = i;
      else break;
    }
    return atual;
  }

  return { load, indiceAtual };

})();

export default Lyrics;