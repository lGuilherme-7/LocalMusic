/** Integra o player local aos controles de mídia oferecidos pelo sistema. */
const MediaSession = (() => {
  let lastPositionUpdate = 0;

  function setup(Player) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;

    const action = (name, handler) => {
      try { navigator.mediaSession.setActionHandler(name, handler); } catch { /* ação não suportada */ }
    };

    action('play', () => Player.play());
    action('pause', () => Player.pause());
    action('previoustrack', () => Player.prev());
    action('nexttrack', () => Player.next());
    action('seekbackward', details => Player.seek(Player.getCurrentTime() - (details.seekOffset || 10)));
    action('seekforward', details => Player.seek(Player.getCurrentTime() + (details.seekOffset || 10)));
    action('seekto', details => {
      if (Number.isFinite(details.seekTime)) Player.seek(details.seekTime);
    });

    Player.onTrack(track => {
      const artwork = track.cover ? [{ src: track.cover, sizes: '512x512' }] : [];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Música desconhecida',
        artist: track.artist || 'Artista desconhecido',
        album: track.album || 'Álbum desconhecido',
        artwork
      });
    });
    Player.onPlay(() => { navigator.mediaSession.playbackState = 'playing'; });
    Player.onPause(() => { navigator.mediaSession.playbackState = 'paused'; });
    Player.onTime(({ current, duration }) => {
      const now = performance.now();
      if (now - lastPositionUpdate < 1000 || !Number.isFinite(duration) || duration <= 0) return;
      lastPositionUpdate = now;
      try {
        navigator.mediaSession.setPositionState({ duration, playbackRate: 1, position: Math.min(current, duration) });
      } catch { /* alguns navegadores rejeitam enquanto metadata ainda carrega */ }
    });
  }

  return { setup };
})();

export default MediaSession;
