const { ipcRenderer } = require('electron');
// Isolated preload: the remote page receives no Node or Electron API.
function time(text) { const parts = text.trim().split(':').map(Number); return parts.every(Number.isFinite) ? parts.reduce((a,b) => a*60+b,0) : 0; }
setInterval(() => {
  if (location.origin !== 'https://soundcloud.com') return;
  const title = document.querySelector('.playbackSoundBadge__titleLink');
  const artist = document.querySelector('.playbackSoundBadge__lightLink');
  const playing = !!document.querySelector('.playControl.playing');
  const visibleTime = selector => {
    const element = document.querySelector(selector);
    return element?.querySelector('[aria-hidden="true"]')?.textContent || '';
  };
  ipcRenderer.send('track', {
    title: title?.getAttribute('title') || title?.textContent?.trim() || '',
    artist: artist?.getAttribute('title') || artist?.textContent?.trim() || '',
    url: title?.href || '', playing,
    position: time(visibleTime('.playbackTimeline__timePassed')),
    duration: time(visibleTime('.playbackTimeline__duration'))
  });
}, 1500);
