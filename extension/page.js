// Runs inside the page itself (world: MAIN), before the site's own scripts. Only from here can we see
// players the site never adds to the document (SoundCloud plays through a detached <audio>).
// Every second: what plays, by whom, where we are in it → content.js via postMessage.
(() => {
  const host = location.hostname;
  const SITES = {
    'soundcloud.com': 'SoundCloud', 'www.youtube.com': 'YouTube', 'music.youtube.com': 'YouTube Music',
    'music.yandex.ru': 'Яндекс Музыка', 'open.spotify.com': 'Spotify', 'vk.com': 'VK Музыка',
    'vk.ru': 'VK Музыка', 'zvuk.com': 'Звук', 'www.deezer.com': 'Deezer', 'music.apple.com': 'Apple Music',
    'listen.tidal.com': 'TIDAL',
  };
  const site = SITES[host] || (host.endsWith('.bandcamp.com') ? 'Bandcamp' : host);

  const media = new Set();
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { media.add(this); return play.apply(this, arguments); };
  document.addEventListener('play', e => { if (e.target instanceof HTMLMediaElement) media.add(e.target); }, true);

  // Muted players don't count: YouTube previews on hover play muted.
  const audible = m => !m.paused && !m.ended && !m.muted && m.volume > 0;
  const finite = v => (Number.isFinite(v) && v >= 0 ? v : null);

  function trackUrl() {
    if (host === 'soundcloud.com') return document.querySelector('.playbackSoundBadge__titleLink')?.href || '';
    if (host.endsWith('youtube.com')) {
      const v = new URLSearchParams(location.search).get('v');
      if (location.pathname === '/watch' && v) return `${location.origin}/watch?v=${encodeURIComponent(v)}`;
      if (location.pathname.startsWith('/shorts/')) return location.origin + location.pathname;
      return '';
    }
    if (host.endsWith('.bandcamp.com') && location.pathname.startsWith('/track/')) return location.origin + location.pathname;
    return '';
  }

  function artwork(md) {
    let best = '', size = -1;
    for (const a of md.artwork || []) {
      const s = Math.max(0, ...String(a.sizes || '').split(/\s+/).map(x => parseInt(x, 10) || 0));
      if (s >= size) { size = s; best = a.src; }  // no sizes given: the last one, usually the biggest
    }
    try { const u = new URL(best, location.href); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
  }

  // The site's own icon for the corner of the cover. Discord can't draw .ico/.svg: take the biggest PNG.
  function siteIcon() {
    let best = '', size = -1;
    for (const l of document.querySelectorAll('link[rel~="icon"], link[rel~="apple-touch-icon"]')) {
      if (!l.href.startsWith('https://') || l.type === 'image/svg+xml' || /\.(svg|ico)(\?|$)/i.test(l.href)) continue;
      const s = l.relList.contains('apple-touch-icon') ? 180
        : Math.max(0, ...String(l.getAttribute('sizes') || '').split(/\s+/).map(x => parseInt(x, 10) || 0));
      if (s > size) { size = s; best = l.href; }
    }
    return best || `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
  }

  // YouTube's auto-generated artist channels are called "<artist> - Topic".
  const cleanArtist = a => (host.endsWith('youtube.com') ? a.replace(/\s+-\s+Topic$/, '') : a);

  // SoundCloud's bottom bar, in case its player ever stops going through play() / the document.
  function scTime(sel) {
    const t = document.querySelector(sel + ' [aria-hidden="true"]')?.textContent?.trim();
    if (!t) return null;
    const p = t.split(':').map(Number);
    return p.every(Number.isFinite) ? p.reduce((a, b) => a * 60 + b, 0) : null;
  }

  function snapshot() {
    for (const m of media) if (!m.isConnected && (m.paused || m.ended)) media.delete(m);
    const md = navigator.mediaSession?.metadata;
    const el = [...media].find(audible) || [...document.querySelectorAll('video, audio')].find(audible);
    const s = {
      playing: !!el, title: md?.title || '', artist: cleanArtist(md?.artist || ''), album: md?.album || '',
      artwork: md ? artwork(md) : '', url: trackUrl(), site, icon: siteIcon(),
      position: el ? finite(el.currentTime) : null, duration: el ? finite(el.duration) : null,
      rate: el?.playbackRate || 1,
    };
    if (!el && host === 'soundcloud.com') {
      s.playing = !!document.querySelector('.playControl.playing');
      s.position = scTime('.playbackTimeline__timePassed');
      s.duration = scTime('.playbackTimeline__duration');
    }
    if (host.endsWith('youtube.com') && document.querySelector('.ad-showing')) s.playing = false;
    if (!s.title) s.playing = false;
    if (!s.duration) s.duration = null;  // 0 = unknown; live streams report Infinity → null above
    return s;
  }

  // Send only what matters: another track, play/pause, a seek. Plus a heartbeat now and then.
  let lastKey = '', last = null, lastAt = 0;
  setInterval(() => {
    const s = snapshot(), now = Date.now();
    const key = JSON.stringify([s.playing, s.title, s.artist, s.album, s.artwork, s.icon, s.url, Math.round(s.duration || 0), s.rate]);
    let seek = false;
    if (s.playing && last?.playing && s.position != null && last.position != null) {
      seek = Math.abs(s.position - (last.position + (now - lastAt) / 1000 * last.rate)) > 3;
    }
    if (key === lastKey && !seek && now - lastAt < 30000) return;
    lastKey = key; last = s; lastAt = now;
    window.postMessage({ musicPresence: s }, location.origin);
  }, 1000);
})();
