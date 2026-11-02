// Bridge page.js (page world) → background. One port per tab: Chrome closes it when the tab is closed
// or leaves the site, and that is how the background learns the music is gone.
let port = null, last = null;

const text = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const num = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const https = v => (typeof v === 'string' && v.length <= 512 && v.startsWith('https://') ? v : '');

function send() {
  try {
    if (!port) {
      port = chrome.runtime.connect({ name: 'tab' });
      // The background was restarted: reconnect right away if something is playing.
      port.onDisconnect.addListener(() => { port = null; if (last?.playing) setTimeout(send, 1000); });
    }
    port.postMessage(last);
  } catch {
    port = null;  // the extension was reloaded: this copy of the script is orphaned
  }
}

window.addEventListener('message', e => {
  const s = e.source === window && e.origin === location.origin && e.data?.musicPresence;
  if (!s || typeof s !== 'object') return;
  last = {
    playing: s.playing === true, title: text(s.title, 128), artist: text(s.artist, 128),
    album: text(s.album, 128), artwork: https(s.artwork), icon: https(s.icon), url: https(s.url), site: text(s.site, 40),
    position: num(s.position), duration: num(s.duration), rate: num(s.rate) || 1,
  };
  send();
});
