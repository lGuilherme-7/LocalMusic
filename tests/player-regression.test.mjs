import assert from 'node:assert/strict';
import { File } from 'node:buffer';

const createdUrls = [];
const revokedUrls = [];
const createObjectUrl = URL.createObjectURL.bind(URL);
const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = blob => {
  const url = createObjectUrl(blob);
  createdUrls.push(url);
  return url;
};
URL.revokeObjectURL = url => {
  revokedUrls.push(url);
  revokeObjectUrl(url);
};

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key)
};

class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.src = '';
    this.currentTime = 0;
    this.duration = Number.NaN;
    this.volume = 1;
    this.paused = true;
    this.readyState = 0;
    this.ended = false;
    this.error = null;
    this.playRequests = [];
  }

  get currentSrc() {
    return this.src;
  }

  removeAttribute(name) {
    if (name === 'src') this.src = '';
  }

  load() {
    this.readyState = 0;
    this.ended = false;
    this.error = null;
  }

  pause() {
    const wasPaused = this.paused;
    this.paused = true;
    if (!wasPaused) this.dispatchEvent(new Event('pause'));
  }

  play() {
    this.paused = false;
    const request = this.playRequests.shift();
    if (request) return request();
    queueMicrotask(() => {
      this.readyState = 3;
      this.dispatchEvent(new Event('playing'));
    });
    return Promise.resolve();
  }
}

const audio = new FakeAudio();
globalThis.document = {
  getElementById(id) {
    assert.equal(id, 'audio-player');
    return audio;
  }
};

const [{ default: Queue }, { default: Player }] = await Promise.all([
  import('../js/queue.js'),
  import('../js/player.js')
]);

const tracks = ['a', 'b', 'c'].map(id => ({
  id,
  title: `Música ${id.toUpperCase()}`,
  file: new File([`audio-${id}`], `${id}.mp3`, { type: 'audio/mpeg' })
}));

const timeEvents = [];
const trackEvents = [];
const blockedEvents = [];
const errorEvents = [];
Player.onTime(value => timeEvents.push(value));
Player.onTrack(track => trackEvents.push(track.id));
Player.onPlaybackBlocked(value => blockedEvents.push(value.track.id));
Player.onError(error => errorEvents.push(error.name));

Queue.set(tracks, 0);
assert.equal(Player.loadTrack(tracks[0]), true);
await Promise.resolve();
await Promise.resolve();

audio.currentTime = 134;
audio.duration = 240;
audio.dispatchEvent(new Event('timeupdate'));
assert.equal(timeEvents.at(-1).current, 134, 'pré-condição do cenário 02:14 inválida');

assert.equal(Player.next(), true);
assert.equal(Player.getCurrentTrack().id, 'b');
assert.deepEqual(timeEvents.at(-1), {
  current: 0,
  duration: 0,
  ratio: 0
}, 'a troca deve invalidar imediatamente tempo e duração da faixa anterior');
assert.equal(JSON.parse(memory.get('lm_current_time')), 0, 'a posição persistida também deve ser reiniciada');

audio.duration = 180;
audio.readyState = 1;
audio.dispatchEvent(new Event('loadedmetadata'));
assert.deepEqual(timeEvents.at(-1), {
  current: 0,
  duration: 180,
  ratio: 0
}, 'metadados da nova faixa devem atualizar sua própria duração');

audio.currentTime = 2;
assert.equal(Player.prev(), true);
assert.equal(Player.getCurrentTrack().id, 'a');
assert.equal(timeEvents.at(-1).current, 0, 'voltar para outra faixa também deve zerar o tempo anterior');

Player.loadTrack(tracks[1]);
audio.currentTime = 50;
Player.loadTrack(tracks[2]);
assert.equal(Player.getCurrentTrack().id, 'c');
assert.equal(timeEvents.at(-1).current, 0, 'seleção direta deve invalidar o tempo da faixa anterior');

let rejectOldPlay;
audio.playRequests.push(() => new Promise((_, reject) => {
  rejectOldPlay = reject;
}));
Player.loadTrack(tracks[0]);
Player.loadTrack(tracks[1]);
Player.loadTrack(tracks[2]);
rejectOldPlay(Object.assign(new Error('requisição substituída'), { name: 'AbortError' }));
await Promise.resolve();
await Promise.resolve();
assert.equal(Player.getCurrentTrack().id, 'c', 'a seleção mais recente deve vencer trocas rápidas');
assert.deepEqual(trackEvents.slice(-3), ['a', 'b', 'c']);
assert.notEqual(Player.getState(), 'error', 'a Promise antiga rejeitada não pode quebrar a faixa atual');

audio.readyState = 0;
audio.duration = 999;
const eventCountBeforeStaleMetadata = timeEvents.length;
audio.dispatchEvent(new Event('loadedmetadata'));
assert.equal(
  timeEvents.length,
  eventCountBeforeStaleMetadata,
  'metadados sem HAVE_METADATA não podem vazar duração de uma carga anterior'
);

const stateBeforeStaleEvents = Player.getState();
audio.paused = false;
audio.dispatchEvent(new Event('pause'));
audio.dispatchEvent(new Event('error'));
audio.dispatchEvent(new Event('ended'));
audio.dispatchEvent(new Event('playing'));
assert.equal(Player.getCurrentTrack().id, 'c');
assert.equal(Player.getState(), stateBeforeStaleEvents, 'eventos antigos incoerentes devem ser ignorados');

audio.readyState = 3;
audio.dispatchEvent(new Event('playing'));
assert.equal(Player.getState(), 'playing', 'playing válido da fonte atual deve continuar sendo aceito');

let resolveCurrentPlay;
audio.playRequests.push(() => new Promise(resolve => {
  resolveCurrentPlay = resolve;
}));
Player.loadTrack(tracks[2]);
assert.equal(Player.getState(), 'loading');
audio.paused = true;
audio.dispatchEvent(new Event('pause'));
assert.equal(Player.getState(), 'loading', 'pause antigo deve ser ignorado enquanto o play atual está pendente');
resolveCurrentPlay();
await Promise.resolve();
await Promise.resolve();
audio.paused = false;
audio.readyState = 3;
audio.dispatchEvent(new Event('playing'));
assert.equal(Player.getState(), 'playing');
audio.dispatchEvent(new Event('waiting'));
assert.equal(Player.getState(), 'buffering');
audio.dispatchEvent(new Event('stalled'));
assert.equal(Player.getState(), 'buffering');
audio.dispatchEvent(new Event('playing'));
assert.equal(Player.getState(), 'playing', 'a reprodução deve sair de buffering quando o áudio voltar');

audio.paused = true;
audio.dispatchEvent(new Event('pause'));
assert.equal(Player.getState(), 'paused', 'uma pausa real após o início deve continuar sendo respeitada');

let rejectCancelledPlay;
audio.playRequests.push(() => new Promise((_, reject) => {
  rejectCancelledPlay = reject;
}));
const cancelledPlay = Player.play();
Player.pause();
rejectCancelledPlay(Object.assign(new Error('cancelada pelo usuário'), { name: 'AbortError' }));
assert.equal(await cancelledPlay, false);
assert.equal(Player.getState(), 'paused', 'a rejeição de uma tentativa cancelada não pode substituir a pausa');
assert.deepEqual(errorEvents, []);

let rejectSupersededPlay;
audio.playRequests.push(
  () => new Promise((_, reject) => { rejectSupersededPlay = reject; }),
  () => Promise.resolve()
);
const supersededPlay = Player.play();
const currentPlay = Player.play();
rejectSupersededPlay(Object.assign(new Error('substituída'), { name: 'AbortError' }));
assert.equal(await supersededPlay, false);
assert.equal(await currentPlay, true);
assert.notEqual(Player.getState(), 'error', 'rejeição de tentativa anterior na mesma faixa deve ser ignorada');

Player.pause();
audio.playRequests.push(() => Promise.reject(Object.assign(new Error('interação necessária'), {
  name: 'NotAllowedError'
})));
assert.equal(await Player.play(), false);
assert.equal(Player.getState(), 'blocked');
assert.deepEqual(blockedEvents, ['c'], 'bloqueio de autoplay deve ser observável e recuperável');
assert.equal(Player.isPlaying(), false, 'a interface não pode afirmar reprodução após rejeição de play()');

let rejectInterruptedByMediaError;
audio.playRequests.push(() => new Promise((_, reject) => {
  rejectInterruptedByMediaError = reject;
}));
const interruptedByMediaError = Player.play();
audio.error = Object.assign(new Error('arquivo inválido'), { name: 'MediaError' });
audio.dispatchEvent(new Event('error'));
rejectInterruptedByMediaError(Object.assign(new Error('interrompida pelo erro'), { name: 'AbortError' }));
assert.equal(await interruptedByMediaError, false);
assert.equal(Player.getState(), 'error');
assert.deepEqual(errorEvents, ['MediaError']);

Queue.set(tracks, 0);
Player.loadTrack(tracks[0]);
await Promise.resolve();
await Promise.resolve();
audio.ended = true;
audio.dispatchEvent(new Event('ended'));
assert.equal(Player.getCurrentTrack().id, 'b', 'o fim da faixa deve usar a fila para carregar a próxima');
assert.equal(timeEvents.at(-1).current, 0, 'a próxima automática também deve invalidar o tempo anterior');
assert.notEqual(Player.getState(), 'error', 'uma faixa nova deve recuperar o player após erro de mídia');

audio.duration = 100;
assert.equal(Player.seek(-20), true);
assert.equal(audio.currentTime, 0);
assert.equal(Player.seek(120), true);
assert.equal(audio.currentTime, 100);
audio.duration = Number.NaN;
assert.equal(Player.seek(10), false, 'busca sem duração conhecida deve ser ignorada');

for (let index = 0; index < 50; index += 1) {
  assert.equal(Player.loadTrack(tracks[index % tracks.length]), true);
}
await Promise.resolve();
await Promise.resolve();
assert.equal(Player.getCurrentTrack().id, 'b', 'a última de 50 trocas rápidas deve permanecer selecionada');
assert.equal(
  createdUrls.length - revokedUrls.length,
  1,
  'somente a Object URL da faixa ativa pode permanecer sem revogação'
);
assert.equal(new Set(revokedUrls).size, revokedUrls.length, 'uma Object URL não deve ser revogada duas vezes');

console.log('player-regression.test.mjs: 02:14, 50 trocas, cancelamentos, buffering, erro/fim, URLs e autoplay passaram');
