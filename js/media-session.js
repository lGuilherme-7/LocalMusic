/** Integra o player local aos controles de mídia oferecidos pelo sistema. */
const MediaSession = (() => {
  let lastPositionUpdate = 0;

  function setPlaybackState(state) {
    try {
      navigator.mediaSession.playbackState = state;
    } catch {
      // playbackState não está disponível em todas as versões do Safari.
    }
  }

  function updateTrack(track) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)
      || typeof MediaMetadata === 'undefined' || !track) return;
    const metadata = {
      title: track.title || 'Música desconhecida',
      artist: track.artist || 'Artista desconhecido',
      album: track.album || 'Álbum desconhecido'
    };
    if (track.cover) metadata.artwork = [{ src: track.cover }];
    try {
      navigator.mediaSession.metadata = new MediaMetadata(metadata);
    } catch {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ ...metadata, artwork: [] });
      } catch {
        // Metadados são opcionais em versões antigas do Safari.
      }
    }
  }

  function setup(Player) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const action = (name, handler) => {
      try {
        navigator.mediaSession.setActionHandler(name, handler);
      } catch {
        // A ação não está disponível nesta implementação da Media Session.
      }
    };

    action('play', () => Player.play());
    action('pause', () => Player.pause());
    action('previoustrack', () => Player.prev());
    action('nexttrack', () => Player.next());
    action('seekbackward', details => Player.seek(Player.getCurrentTime() - (details?.seekOffset || 10)));
    action('seekforward', details => Player.seek(Player.getCurrentTime() + (details?.seekOffset || 10)));
    action('seekto', details => {
      if (Number.isFinite(details?.seekTime)) Player.seek(details.seekTime);
    });

    Player.onTrack(updateTrack);
    Player.onPlay(() => setPlaybackState('playing'));
    Player.onPause(() => setPlaybackState('paused'));
    Player.onState(({ state }) => {
      if (['loading', 'blocked', 'error', 'ended'].includes(state)) {
        setPlaybackState('paused');
      }
    });
    Player.onTime(({ current, duration }) => {
      const now = performance.now();
      if (now - lastPositionUpdate < 1000 || !Number.isFinite(duration) || duration <= 0) return;
      lastPositionUpdate = now;
      try {
        navigator.mediaSession.setPositionState({ duration, playbackRate: 1, position: Math.min(current, duration) });
      } catch {
        // Alguns navegadores rejeitam enquanto os metadados ainda carregam.
      }
    });
  }

  return { setup, updateTrack };
})();

export default MediaSession;
