const { app, BrowserWindow, ipcMain, Menu, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { RPC } = require('./rpc');
let player, setup, rpc, latest = null, retry, lastSignature = '', lastSent = 0, quitting = false;
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const soundcloud = value => { try { return new URL(value).origin === 'https://soundcloud.com'; } catch { return false; } };
function options(preload) { return { width: 1100, height: 780, backgroundColor: '#151519', webPreferences: {preload: path.join(__dirname, preload), contextIsolation: true, nodeIntegration: false, sandbox: true} }; }
function status(text) { if (player && !player.isDestroyed()) player.setTitle('SoundCloud Presence — ' + text); }
async function connect(id) {
  if (quitting) return;
  rpc = new RPC(id);
  rpc.on('status', status);
  rpc.on('disconnected', () => { if (!quitting) { status('Discord отключён, повтор подключения…'); clearTimeout(retry); retry = setTimeout(() => connect(id), 5000); } });
  try { await rpc.connect(); lastSignature = ''; lastSent = 0; status('Discord подключён'); }
  catch (e) { status(e.message); if (!quitting) retry = setTimeout(() => connect(id), 5000); }
}
function openPlayer(id) {
  player = new BrowserWindow(options('preload.js'));
  player.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  player.webContents.on('will-navigate', (event, url) => { if (!soundcloud(url)) event.preventDefault(); });
  player.loadURL('https://soundcloud.com').catch(e => status('Ошибка загрузки: ' + e.message));
  player.on('closed', () => app.quit());
  connect(id);
}
function openSetup() { setup = new BrowserWindow({...options('setup-preload.js'), width: 640, height: 540}); setup.loadFile('setup.html'); }
ipcMain.handle('save-id', (event, id) => {
  if (!setup || event.sender !== setup.webContents || event.senderFrame !== setup.webContents.mainFrame || typeof id !== 'string' || !/^\d{17,22}$/.test(id)) throw new Error('Invalid ID');
  fs.writeFileSync(configPath(), JSON.stringify({clientId: id}));
  setup.close(); setup = null; openPlayer(id);
});
ipcMain.on('track', (event, data) => {
  if (!player || event.sender !== player.webContents || event.senderFrame !== player.webContents.mainFrame || !soundcloud(event.senderFrame.url)) return;
  if (!data || typeof data.title !== 'string' || typeof data.artist !== 'string' || !soundcloud(data.url)) { latest = null; return; }
  latest = { title: data.title.slice(0,128), artist: data.artist.slice(0,128), url: data.url.slice(0,512), playing: data.playing === true, position: Math.max(0, Number(data.position)||0), duration: Math.max(0, Number(data.duration)||0), received: Date.now() };
});
setInterval(() => {
  if (!rpc?.ready) return;
  const track = latest;
  const active = track?.playing && track.title && Date.now()-track.received < 10000;
  const signature = active ? JSON.stringify([track.title, track.artist,track.url, Math.round(track.position/15)]) : 'paused';
  if (signature === lastSignature || Date.now()-lastSent < 15000) return;
  lastSignature = signature; lastSent = Date.now();
  if (!active) { rpc.activity(null); status('Пауза — статус скрыт'); return; }
  const activity = {type: 2, details: track.title.padEnd(2,' '), state: (track.artist || 'SoundCloud').padEnd(2,' '), buttons: [{label:'Открыть трек',url:track.url}], instance:false};
  if (track.duration > track.position && track.duration < 86400) {
    const start = Math.floor(Date.now()/1000-track.position);
    activity.timestamps = {start,end:start+Math.floor(track.duration)};
  }
  rpc.activity(activity); status(track.artist + ' — ' + track.title);
}, 1500);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const win = player || setup; if (win) {if(win.isMinimized())win.restore();win.focus();} });
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Программа', submenu:[{label:'Изменить Application ID',click:()=>{rpc?.close();clearTimeout(retry);fs.rmSync(configPath(),{force:true});app.relaunch();app.quit();}},{role:'reload'},{role:'quit',label:'Выход'}]}]));
    let id; try {id=JSON.parse(fs.readFileSync(configPath(),'utf8')).clientId;} catch {}
    if (typeof id==='string' && /^\d{17,22}$/.test(id)) openPlayer(id); else openSetup();
  });
  app.on('before-quit', () => {quitting=true;clearTimeout(retry);rpc?.close();});
  app.on('window-all-closed',()=>app.quit());
}
