import Storage from './storage.js';

/** Fila persistente com ordem original preservada durante o shuffle. */
const Queue = (() => {
  const STORAGE_KEY = 'lm_player_state';
  let original = [];
  let shuffled = null;
  let index = 0;
  let repeat = 'normal';

  const active = () => shuffled || original;
  const ids = list => list.map(track => track.id);

  function save() {
    Storage.set(STORAGE_KEY, {
      queue: ids(original),
      shuffledQueue: shuffled ? ids(shuffled) : null,
      index,
      shuffle: Boolean(shuffled),
      repeat
    });
  }

  function set(tracks, start = 0) {
    original = [...tracks];
    shuffled = null;
    index = Math.min(Math.max(0, start), Math.max(0, original.length - 1));
    save();
  }

  function restore(tracks) {
    const saved = Storage.get(STORAGE_KEY);
    if (!saved || !Array.isArray(saved.queue)) return false;
    const byId = new Map(tracks.map(track => [track.id, track]));
    original = saved.queue.map(id => byId.get(id)).filter(Boolean);
    if (saved.shuffle && Array.isArray(saved.shuffledQueue)) {
      shuffled = saved.shuffledQueue.map(id => byId.get(id)).filter(Boolean);
    } else {
      shuffled = null;
    }
    index = Math.min(Number(saved.index) || 0, Math.max(0, active().length - 1));
    repeat = ['normal', 'repeat-all', 'repeat-one'].includes(saved.repeat) ? saved.repeat : 'normal';
    return true;
  }

  const current = () => active()[index] || null;
  const getQueue = () => [...active()];
  const getIndex = () => index;

  function next({ automatic = false } = {}) {
    if (!active().length) return null;
    if (repeat === 'repeat-one' && automatic) return current();
    if (index < active().length - 1) index += 1;
    else if (repeat === 'repeat-all') index = 0;
    else return null;
    save();
    return current();
  }

  function prev() {
    if (!active().length) return null;
    if (index > 0) index -= 1;
    else if (repeat === 'repeat-all') index = active().length - 1;
    save();
    return current();
  }

  function playAt(position) {
    if (position < 0 || position >= active().length) return null;
    index = position;
    save();
    return current();
  }

  function addNext(track) {
    if (!track) return;
    const currentTrack = current();
    const originalIndex = original.indexOf(currentTrack);
    original.splice(Math.max(0, originalIndex + 1), 0, track);
    if (shuffled) shuffled.splice(index + 1, 0, track);
    save();
  }

  function addEnd(track) {
    if (!track) return;
    original.push(track);
    if (shuffled) shuffled.push(track);
    save();
  }

  function removeTrack(position) {
    const list = active();
    if (position < 0 || position >= list.length || position === index) return false;
    const [removed] = list.splice(position, 1);
    if (shuffled) {
      const originalPosition = original.indexOf(removed);
      if (originalPosition >= 0) original.splice(originalPosition, 1);
    }
    if (position < index) index -= 1;
    save();
    return true;
  }

  function moveTrack(from, to) {
    const list = active();
    if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to || from === index) return false;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    if (index === to) index += from < to ? -1 : 1;
    else if (from < index && to >= index) index -= 1;
    else if (from > index && to <= index) index += 1;
    save();
    return true;
  }

  function clear(keepCurrent = true) {
    const playing = current();
    original = keepCurrent && playing ? [playing] : [];
    shuffled = null;
    index = 0;
    save();
  }

  function shuffledCopy(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const random = Math.floor(Math.random() * (i + 1));
      [result[i], result[random]] = [result[random], result[i]];
    }
    return result;
  }

  function setShuffle(enabled) {
    const playing = current();
    if (enabled && !shuffled) {
      shuffled = playing ? [playing, ...shuffledCopy(original.filter((_, position) => position !== original.indexOf(playing)))] : shuffledCopy(original);
      index = 0;
    } else if (!enabled && shuffled) {
      shuffled = null;
      index = Math.max(0, original.indexOf(playing));
    }
    save();
  }

  const isShuffled = () => Boolean(shuffled);

  function cycleRepeat() {
    repeat = repeat === 'normal' ? 'repeat-all' : repeat === 'repeat-all' ? 'repeat-one' : 'normal';
    save();
    return repeat;
  }

  const getRepeatMode = () => repeat;

  return { set, restore, current, getQueue, getIndex, next, prev, playAt, addNext, addEnd, removeTrack, moveTrack, clear, setShuffle, isShuffled, cycleRepeat, getRepeatMode };
})();

export default Queue;
