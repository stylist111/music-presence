const STATUS = {
  idle: ['Включи музыку — и она появится в Discord', false],
  connecting: ['Подключаюсь к Discord…', false],
  connected: ['Discord подключён', false],
  'no-discord': ['Discord не запущен', true],
  'no-host': ['Помощник не установлен — запусти установщик', true],
  error: ['', true],
};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function render({ status, shown, enabled, hasId }) {
  const card = document.getElementById('card');
  card.replaceChildren();
  if (shown) {
    const img = el('img');
    if (shown.artwork) img.src = shown.artwork;
    const info = el('div');
    info.append(el('div', 't', shown.title), el('div', 'a', shown.artist || '—'), el('div', 's', shown.site));
    card.append(img, info);
  } else {
    card.append(el('div', 'empty', enabled ? 'Сейчас ничего не играет' : 'Показ в Discord выключен'));
  }
  const [text, bad] = STATUS[status.state] || STATUS.error;
  const line = document.getElementById('status');
  line.textContent = !hasId ? 'Не указан Application ID (см. README)'
    : status.state === 'connected' && status.user ? `${text}: ${status.user}` : text || status.text || '';
  line.className = bad || !hasId ? 'bad' : '';
  document.getElementById('enabled').checked = enabled;
}

const update = () => chrome.runtime.sendMessage('get').then(render).catch(() => {});
document.getElementById('enabled').onchange = e => chrome.storage.local.set({ enabled: e.target.checked }).then(update);
update();
setInterval(update, 1000);
