/** Interpreta letras LRC, Enhanced LRC, SRT, texto simples e o contrato canônico. */
const Lyrics = (() => {
  const cache = new Map();
  const lrcTimeTag = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  const enhancedTimeTag = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;

  function timestamp(value) {
    const match = String(value || '').trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?$/);
    if (!match) return null;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const fraction = String(match[4] || '');
    const milliseconds = fraction ? Number(fraction) * (fraction.length === 1 ? 100 : fraction.length === 2 ? 10 : 1) : 0;
    if (seconds >= 60 || minutes >= 60) return null;
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  }

  function tagTime(match, offset = 0) {
    const fraction = String(match?.[3] || '');
    const milliseconds = fraction ? Number(fraction) * (fraction.length === 1 ? 100 : fraction.length === 2 ? 10 : 1) : 0;
    const value = Number(match?.[1]) * 60 + Number(match?.[2]) + milliseconds / 1000 + offset;
    return Number.isFinite(value) && value >= 0 && Number(match?.[2]) < 60 ? value : null;
  }

  function staticLines(text) {
    return String(text || '').replace(/\r/g, '').split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(original => ({ start: null, end: null, original, translated: '', tokens: [], timed: false }));
  }

  function parseSrt(text) {
    const lines = [];
    String(text || '').replace(/\r/g, '').trim().split(/\n\s*\n+/).forEach(block => {
      const rows = block.split('\n').filter(Boolean);
      const timingIndex = rows.findIndex(row => row.includes('-->'));
      if (timingIndex < 0) return;
      const match = rows[timingIndex].match(/([\d:,.]+)\s*-->\s*([\d:,.]+)/);
      const start = timestamp(match?.[1]);
      const end = timestamp(match?.[2]);
      const original = rows.slice(timingIndex + 1).join(' ').trim();
      if (start === null || end === null || end < start || !original) return;
      lines.push({ start, end, original, translated: '', tokens: [], timed: true });
    });
    return lines.sort((left, right) => left.start - right.start);
  }

  function addEnhancedToken(tokens, text, start, textStart) {
    const first = text.search(/\S/);
    if (start === null || first < 0) return;
    const last = text.search(/\s*$/);
    const startChar = textStart + first;
    const endChar = textStart + last;
    if (endChar > startChar) tokens.push({ start, end: null, startChar, endChar });
  }

  function parseEnhancedText(value, offset) {
    const tokens = [];
    let original = '';
    let cursor = 0;
    let tokenStart = null;
    let match;
    enhancedTimeTag.lastIndex = 0;

    while ((match = enhancedTimeTag.exec(value))) {
      const segment = value.slice(cursor, match.index);
      const segmentStart = original.length;
      original += segment;
      addEnhancedToken(tokens, segment, tokenStart, segmentStart);
      tokenStart = tagTime(match, offset);
      cursor = enhancedTimeTag.lastIndex;
    }

    const tail = value.slice(cursor);
    const tailStart = original.length;
    original += tail;
    addEnhancedToken(tokens, tail, tokenStart, tailStart);
    const leading = original.match(/^\s*/)[0].length;
    const trailing = original.match(/\s*$/)[0].length;
    const lastContent = original.length - trailing;
    return {
      original: original.trim(),
      tokens: tokens
        .filter(token => token.startChar >= leading && token.endChar <= lastContent)
        .map(token => ({ ...token, startChar: token.startChar - leading, endChar: token.endChar - leading }))
    };
  }

  function parseLrc(text) {
    const content = String(text || '').replace(/\r/g, '');
    const offsetMatch = content.match(/^\s*\[offset:([+-]?\d+)\]/im);
    const offset = Number(offsetMatch?.[1] || 0) / 1000;
    const synced = [];
    const plain = [];
    const metadataTag = /^\s*\[(ar|al|ti|by|re|ve|offset):/i;

    content.split('\n').forEach((row, rowIndex) => {
      lrcTimeTag.lastIndex = 0;
      const tags = [...row.matchAll(lrcTimeTag)];
      const rawOriginal = row.replace(lrcTimeTag, '').trim();
      if (!tags.length) {
        if (rawOriginal && !metadataTag.test(row)) plain.push(rawOriginal);
        return;
      }
      if (!rawOriginal) return;

      const enhanced = parseEnhancedText(rawOriginal, offset);
      if (!enhanced.original) return;
      tags.forEach((tag, tagIndex) => {
        const start = tagTime(tag, offset);
        if (start === null) return;
        const tokens = enhanced.tokens
          .filter(token => token.start >= start)
          .map(token => ({ ...token }));
        synced.push({
          start,
          end: start,
          original: enhanced.original,
          translated: '',
          tokens,
          timed: true,
          order: rowIndex * 100 + tagIndex
        });
      });
    });

    if (synced.length) {
      return normalizeLines(synced.sort((left, right) => left.start - right.start || left.order - right.order)
        .map(({ order, ...line }) => line));
    }
    return plain.map(original => ({ start: null, end: null, original, translated: '', tokens: [], timed: false }));
  }

  function normalizeToken(token, line, text) {
    const start = Number(token?.start);
    const endValue = token?.end;
    const end = endValue === null || endValue === undefined || endValue === '' ? null : Number(endValue);
    const startChar = Number(token?.startChar);
    const endChar = Number(token?.endChar);
    if (![start, startChar, endChar].every(Number.isFinite)) return null;
    if (end !== null && !Number.isFinite(end)) return null;
    if (!line.timed || start < line.start || (end !== null && end < start)
      || startChar < 0 || endChar <= startChar || endChar > text.length) return null;
    return { start, end, startChar, endChar };
  }

  function normalizeTokens(tokens, line, text) {
    const normalized = (Array.isArray(tokens) ? tokens : [])
      .map(token => normalizeToken(token, line, text));
    if (normalized.some(token => !token)) return [];
    normalized.sort((left, right) => left.start - right.start || left.startChar - right.startChar);
    for (let index = 1; index < normalized.length; index += 1) {
      const previous = normalized[index - 1];
      const current = normalized[index];
      if (current.start <= previous.start || current.startChar < previous.endChar) return [];
    }
    return normalized.map((token, index) => {
      const next = normalized[index + 1];
      const end = token.end === null && next ? next.start : token.end;
      return { ...token, end };
    });
  }

  function normalizeLine(value) {
    const hasStart = Number.isFinite(Number(value?.start));
    const timed = value?.timed !== false && hasStart;
    const start = timed ? Number(value.start) : null;
    const endValue = Number(value?.end);
    const original = String(value?.original ?? value?.text ?? '');
    const translated = String(value?.translated ?? value?.translation?.text ?? '');
    const line = {
      start,
      end: timed && Number.isFinite(endValue) && endValue >= start ? endValue : start,
      original,
      translated,
      tokens: [],
      timed
    };
    line.tokens = normalizeTokens(value?.tokens, line, original);
    return line;
  }

  function normalizeLines(lines) {
    return (Array.isArray(lines) ? lines : []).map(normalizeLine).filter(line => line.original)
      .sort((left, right) => {
        if (!left.timed && !right.timed) return 0;
        if (!left.timed) return 1;
        if (!right.timed) return -1;
        return left.start - right.start;
      });
  }

  async function parseFile(file, format) {
    if (!file) return { lines: [], status: 'unavailable' };
    const key = [file.name, file.size, file.lastModified, format || ''].join('_');
    if (cache.has(key)) return cache.get(key);
    const result = (async () => {
      try {
        const text = await file.text();
        if (!text.trim()) return { lines: [], status: 'invalid' };
        const type = (format || file.name.split('.').pop() || '').toLocaleLowerCase();
        const lines = type === 'lrc' ? parseLrc(text) : type === 'srt' ? parseSrt(text) : staticLines(text);
        return { lines, status: lines.length ? (lines.some(line => line.timed) ? 'synced' : 'text') : 'invalid' };
      } catch {
        return { lines: [], status: 'error' };
      }
    })();
    cache.set(key, result);
    return result;
  }

  function mergeTranslations(lines, translations) {
    if (!translations.length || !lines.length) return lines;
    const allStatic = lines.every(line => !line.timed) && translations.every(line => !line.timed);
    const sameSize = lines.length === translations.length;
    const timedTranslations = translations.filter(candidate => candidate.timed);
    return lines.map((line, index) => {
      if (allStatic || sameSize) return { ...line, translated: translations[index]?.original || '' };
      if (!line.timed) return line;
      const nearest = timedTranslations.reduce((best, candidate) => {
        if (!best || Math.abs(candidate.start - line.start) < Math.abs(best.start - line.start)) return candidate;
        return best;
      }, null);
      return nearest && Math.abs(nearest.start - line.start) <= 1.5 ? { ...line, translated: nearest.original } : line;
    });
  }

  async function loadWithStatus(track) {
    if (!track) return { lines: [], status: 'unavailable', hasTranslation: false };
    const external = await parseFile(track.lyricsFile, track.lyricsFormat);
    const inline = normalizeLines(track.lyrics);
    const primary = external.lines.length ? external : inline.length
      ? { lines: inline, status: inline.some(line => line.timed) ? 'synced' : 'text' }
      : external;
    if (!primary.lines.length) return { lines: [], status: primary.status, hasTranslation: false };

    const translation = await parseFile(track.translationFile, track.translationFormat);
    const lines = mergeTranslations(primary.lines, translation.lines);
    return { lines, status: primary.status, hasTranslation: lines.some(line => line.translated) };
  }

  async function load(track) {
    return (await loadWithStatus(track)).lines;
  }

  function activeIndex(lines, time) {
    const current = Number(time);
    if (!Number.isFinite(current)) return -1;
    let low = 0;
    let high = lines.length - 1;
    let candidate = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const line = lines[middle];
      if (!line?.timed || line.start > current) high = middle - 1;
      else {
        candidate = middle;
        low = middle + 1;
      }
    }
    if (candidate < 0) return -1;
    const line = lines[candidate];
    const next = lines[candidate + 1]?.timed ? lines[candidate + 1] : null;
    const end = line.end > line.start ? line.end : (next?.start ?? Infinity);
    return current < end ? candidate : -1;
  }

  function tokenProgresses(line, time) {
    if (!line?.timed || !line.tokens?.length || !Number.isFinite(Number(time))) return [];
    return line.tokens.map(token => {
      if (time < token.start) return 0;
      if (!Number.isFinite(token.end) || token.end <= token.start) return 1;
      return Math.min(1, Math.max(0, (time - token.start) / (token.end - token.start)));
    });
  }

  function tokenProgress(line, time) {
    const progress = tokenProgresses(line, time);
    if (!progress.length) return null;
    return line.tokens.reduce((total, token, index) => total + (token.endChar - token.startChar) * progress[index], 0);
  }

  return { load, loadWithStatus, parseLrc, parseSrt, activeIndex, tokenProgress, tokenProgresses };
})();

export default Lyrics;
