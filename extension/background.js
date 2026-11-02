// Picks what to show (the tab that started playing last) and hands it to the helper, which talks to
// Discord. The helper only runs while there is music: when nothing has played for a minute it is
// disconnected, exits, and Discord drops the status.
const HOST = 'com.musicpresence.host';
const CLIENT_ID = '1566907354707009636';  // Discord Application ID, see README
const IDLE_MS = 60_000;
// Our own icons for sites whose favicon doesn't fill Discord's round slot (src/badges.py).
const BADGES = { YouTube: 'youtube' };
const BADGE_URL = 'https://raw.githubusercontent.com/stylist111/music-presence/main/badges/';

const tabs = new Map();  // tabId → { port, state, at, since }
let native = null, status = { state: 'idle' }, idleTimer = null, retryAt = 0, enabled = true, shown = null;

chrome.storage.local.get('enabled').then(v => { enabled = v.enabled !== false; refresh(); });
chrome.storage.onChanged.addListener(c => { if (c.enabled) { enabled = c.enabled.newValue !== false; refresh(); } });

chrome.runtime.onConnect.addListener(port => {
  const tabId = port.sender?.tab?.id;
  if (port.name !== 'tab' || tabId == null) return port.disconnect();
  port.onMessage.addListener(state => {
    const old = tabs.get(tabId);
    const since = state.playing ? (old?.state.playing ? old.since : Date.now()) : 0;
    tabs.set(tabId, { port, state, at: Date.now(), since });
    refresh();
  });
  port.onDisconnect.addListener(() => {
    if (tabs.get(tabId)?.port === port) { tabs.delete(tabId); refresh(); }
  });
});

// For the popup.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg === 'get') reply({ status, shown, enabled, hasId: !!CLIENT_ID });
});

function refresh() {
  let best = null;
  if (enabled) for (const t of tabs.values()) if (t.state.playing && (!best || t.since > best.since)) best = t;
  shown = best?.state || null;
  if (best) {
    clearTimeout(idleTimer); idleTimer = null;
    if (connect()) native.postMessage({ type: 'activity', activity: activity(best) });
  } else if (native) {
    native.postMessage({ type: 'activity', activity: null });
    if (!idleTimer) idleTimer = setTimeout(disconnect, enabled ? IDLE_MS : 0);
  }
}

function connect() {
  if (native) return true;
  if (!CLIENT_ID) { status = { state: 'error', text: 'Не указан Application ID' }; return false; }
  if (Date.now() < retryAt) return false;
  native = chrome.runtime.connectNative(HOST);
  native.onMessage.addListener(m => { if (m?.type === 'status') status = m; });
  native.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError?.message || 'Помощник закрылся';
    native = null; clearTimeout(idleTimer); idleTimer = null;
    status = /not found/i.test(err) ? { state: 'no-host' } : { state: 'error', text: err };
    retryAt = Date.now() + 30_000;
    setTimeout(refresh, 30_500);
  });
  native.postMessage({ type: 'hello', clientId: CLIENT_ID });
  status = { state: 'connecting' };
  return true;
}

function disconnect() {
  idleTimer = null;
  native?.disconnect();  // our own disconnect() doesn't fire onDisconnect
  native = null;
  status = { state: 'idle' };
}

const pad = s => (s.length < 2 ? s.padEnd(2, '⠀') : s);  // Discord wants at least 2 characters

function activity({ state: s, at }) {
  const a = {
    type: 2,                  // "Listening to"
    status_display_type: 1,   // member list: "Listening to <artist>" instead of the app name
    details: pad(s.title),
    state: pad(s.artist || s.site),
    instance: false,
  };
  if (s.url) {
    a.details_url = s.url;
    a.buttons = [{ label: 'Открыть трек', url: s.url }];
  }
  // Cover with the site's icon in the corner; no cover → the icon alone.
  const fits = u => u && u.length <= 256;
  const icon = BADGES[s.site] ? `${BADGE_URL}${BADGES[s.site]}.png` : s.icon;
  const cover = fits(s.artwork) ? s.artwork : fits(icon) ? icon : '';
  if (cover) {
    a.assets = { large_image: cover, large_text: pad((s.album || s.site).slice(0, 128)) };
    if (cover !== icon && fits(icon)) Object.assign(a.assets, { small_image: icon, small_text: pad(s.site) });
  }
  if (s.position != null && s.rate > 0) {
    const start = Math.round(at / 1000 - s.position / s.rate);
    a.timestamps = { start };
    if (s.duration > s.position) a.timestamps.end = start + Math.round(s.duration / s.rate);
  }
  return a;
}
