"""Music Presence helper: passes what the browser plays on to the Discord app on this computer.

    host.exe --install      register for browsers
    host.exe --uninstall    unregister
    (no flags)              native messaging host, started by the browser while music plays
"""
import asyncio
import base64
import collections
import hashlib
import json
import os
import re
import struct
import sys
import threading
import time
import uuid

NAME = 'com.musicpresence.host'
FROZEN = getattr(sys, 'frozen', False)
# Frozen: <root>/app/host.exe. Source: <root>/src/host.py. Either way ROOT = <root>.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(sys.executable if FROZEN else __file__)))
APP = os.path.join(ROOT, 'app')
LOG = os.path.join(ROOT, 'host.log')
BROWSERS = [
    r'Software\Google\Chrome',
    r'Software\Microsoft\Edge',
    r'Software\BraveSoftware\Brave-Browser',
    r'Software\Yandex\YandexBrowser',
    r'Software\Chromium',
]
RATE_N, RATE_WINDOW = 5, 20.0     # Discord: at most 5 activity updates per 20 s
RETRY = 5.0                       # seconds between attempts to reach Discord
NEW_FIELDS = ('status_display_type', 'details_url', 'state_url')  # older Discord builds reject these


# --------------------------------------------------------------------------- install

def ext_id():
    with open(os.path.join(ROOT, 'extension', 'manifest.json'), encoding='utf-8') as f:
        key = json.load(f)['key']
    h = hashlib.sha256(base64.b64decode(key)).hexdigest()[:32]
    return ''.join(chr(ord('a') + int(c, 16)) for c in h)


def install():
    import winreg
    os.makedirs(APP, exist_ok=True)
    exe = sys.executable if FROZEN else os.path.join(APP, 'host.bat')
    if not FROZEN:  # dev run from source
        with open(exe, 'w', encoding='ascii') as f:
            f.write(f'@echo off\r\n"{sys.executable}" -u "{os.path.abspath(__file__)}" %*\r\n')
    manifest = os.path.join(APP, NAME + '.json')
    with open(manifest, 'w', encoding='utf-8') as f:
        json.dump({'name': NAME, 'description': 'Music Presence helper', 'path': exe, 'type': 'stdio',
                   'allowed_origins': [f'chrome-extension://{ext_id()}/']}, f, indent=2)
    for b in BROWSERS:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf'{b}\NativeMessagingHosts\{NAME}') as k:
            winreg.SetValueEx(k, '', 0, winreg.REG_SZ, manifest)
    ext_dir = os.path.join(ROOT, 'extension')
    copy_to_clipboard(ext_dir)
    print('Готово. Путь к расширению скопирован в буфер обмена:', ext_dir)


def copy_to_clipboard(text):
    # Windows refuses clipboard writes from a process without a window, so let PowerShell do it.
    # The text goes through an env var: no quoting issues with odd user names.
    import subprocess
    subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -Value $env:MP_CLIP'],
                   env=dict(os.environ, MP_CLIP=text), creationflags=subprocess.CREATE_NO_WINDOW,
                   stdin=subprocess.DEVNULL, capture_output=True, timeout=30)


def uninstall():
    import winreg
    ours = os.path.normcase(os.path.join(APP, NAME + '.json'))
    for b in BROWSERS:
        key = rf'{b}\NativeMessagingHosts\{NAME}'
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as k:
                target = winreg.QueryValueEx(k, '')[0]
            # Leave it alone if the browser points at another copy.
            if os.path.normcase(target) == ours:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key)
        except FileNotFoundError:
            pass
    print('Music Presence отключён от браузеров.')


# --------------------------------------------------------------------------- browser side

_out_lock = threading.Lock()


def log(*a):
    try:
        if os.path.getsize(LOG) > 256 * 1024:
            os.replace(LOG, LOG + '.old')
    except OSError:
        pass
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            print(time.strftime('%m-%d %H:%M:%S'), *a, file=f)
    except OSError:
        pass


def send(msg):
    data = json.dumps(msg, ensure_ascii=False).encode('utf-8')
    with _out_lock:
        try:
            sys.stdout.buffer.write(struct.pack('<I', len(data)) + data)
            sys.stdout.buffer.flush()
        except OSError:  # browser went away
            os._exit(0)


def read():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    n = struct.unpack('<I', raw)[0]
    buf = sys.stdin.buffer.read(n)
    return json.loads(buf.decode('utf-8')) if len(buf) == n else None


# --------------------------------------------------------------------------- Discord side

def frame(op, data):
    body = json.dumps(data, ensure_ascii=False).encode('utf-8')
    return struct.pack('<II', op, len(body)) + body


class Decoder:
    """Splits the byte stream from Discord into (op, message); pieces may arrive split or glued."""

    def __init__(self):
        self.buf = b''

    def push(self, data):
        self.buf += data
        out = []
        while len(self.buf) >= 8:
            op, n = struct.unpack_from('<II', self.buf)
            if n > 1 << 20:
                raise ValueError('frame too large')
            if len(self.buf) < 8 + n:
                break
            body, self.buf = self.buf[8:8 + n], self.buf[8 + n:]
            out.append((op, json.loads(body.decode('utf-8'))))
        return out


class Pipe(asyncio.Protocol):
    def __init__(self, owner):
        self.owner, self.decoder, self.transport = owner, Decoder(), None

    def connection_made(self, transport):
        self.transport = transport

    def data_received(self, data):
        try:
            for op, msg in self.decoder.push(data):
                self.owner.on_frame(self, op, msg)
        except ValueError as e:
            log('bad data from Discord:', e)
            self.transport.close()

    def connection_lost(self, exc):
        self.owner.on_lost(self)

    def write(self, op, data):
        if self.transport and not self.transport.is_closing():
            self.transport.write(frame(op, data))


def same(a, b):
    """Equal apart from timestamps drifting by a second or two (each heartbeat recomputes them)."""
    if a is None or b is None:
        return a is b
    ta, tb = a.get('timestamps') or {}, b.get('timestamps') or {}
    if set(ta) != set(tb) or any(abs(ta[k] - tb[k]) > 2 for k in ta):
        return False
    strip = lambda x: {k: v for k, v in x.items() if k != 'timestamps'}
    return strip(a) == strip(b)


class Discord:
    def __init__(self):
        self.client_id = None
        self.pipe = None
        self.ready = False
        self.handshake = None
        self.want = None        # what should be shown (None = nothing)
        self.sent = ...         # what Discord was last told (... = unknown)
        self.sent_times = collections.deque()
        self.timer = None
        self.plain = False      # Discord rejected the newer fields: stop sending them
        self.pending = {}       # nonce -> activity, to see which update Discord rejected
        self.changed = asyncio.Event()

    def status(self, state, **extra):
        send({'type': 'status', 'state': state, **extra})

    # ---- connection

    async def run(self):
        while True:
            if self.client_id and not self.pipe:
                err = await self.connect()
                if err:
                    self.status('no-discord' if err == 'no-discord' else 'error', text=err)
                    await asyncio.sleep(RETRY)
                    continue
            await self.changed.wait()
            self.changed.clear()

    async def connect(self):
        loop = asyncio.get_running_loop()
        self.status('connecting')
        for i in range(10):
            try:
                transport, proto = await loop.create_pipe_connection(lambda: Pipe(self), rf'\\.\pipe\discord-ipc-{i}')
            except OSError:
                continue
            proto.transport = transport  # connection_made() only runs on the next loop turn
            self.pipe, self.handshake = proto, loop.create_future()
            proto.write(0, {'v': 1, 'client_id': self.client_id})
            try:
                user = await asyncio.wait_for(self.handshake, 5)
            except Exception as e:
                proto.transport.close()
                self.pipe = None
                log('handshake failed:', repr(e))
                return str(e) or 'Discord не ответил'
            self.ready = True
            log('connected to pipe', i, 'as', user)
            self.status('connected', user=user)
            self.flush()
            return None
        return 'no-discord'

    def on_frame(self, pipe, op, msg):
        if pipe is not self.pipe or not isinstance(msg, dict):
            return
        if op == 3:    # ping
            pipe.write(4, msg)
        elif op == 2:  # close, e.g. wrong Application ID
            text = msg.get('message') or 'Discord отказал в подключении'
            log('close from Discord:', msg)
            if self.handshake and not self.handshake.done():
                self.handshake.set_exception(RuntimeError(text))
            else:
                self.status('error', text=text)
            pipe.transport.close()
        elif msg.get('evt') == 'READY':
            user = (msg.get('data') or {}).get('user') or {}
            if self.handshake and not self.handshake.done():
                self.handshake.set_result(user.get('global_name') or user.get('username') or '')
        elif msg.get('cmd') == 'SET_ACTIVITY':
            sent = self.pending.pop(msg.get('nonce'), None)
            if msg.get('evt') == 'ERROR':
                log('SET_ACTIVITY rejected:', msg.get('data'))
                if not self.plain and sent and any(k in sent for k in NEW_FIELDS):
                    self.plain, self.sent = True, ...
                    self.flush()
                else:
                    self.status('error', text=(msg.get('data') or {}).get('message') or 'Discord не принял статус')

    def on_lost(self, pipe):
        if pipe is not self.pipe:
            return
        log('Discord connection lost')
        self.pipe, self.ready, self.sent = None, False, ...
        self.pending.clear()
        if self.handshake and not self.handshake.done():
            self.handshake.set_exception(RuntimeError('Discord закрыл соединение'))
        self.changed.set()

    def set_client(self, client_id):
        if client_id == self.client_id:
            return
        self.client_id = client_id
        if self.pipe:
            self.pipe.transport.close()
        self.changed.set()

    # ---- activity

    def set(self, activity):
        self.want = activity
        self.flush()

    def flush(self):
        if not self.ready or (self.sent is not ... and same(self.want, self.sent)):
            return
        now = time.monotonic()
        while self.sent_times and now - self.sent_times[0] >= RATE_WINDOW:
            self.sent_times.popleft()
        if len(self.sent_times) >= RATE_N:
            if not self.timer:
                delay = RATE_WINDOW - (now - self.sent_times[0]) + 0.1
                self.timer = asyncio.get_running_loop().call_later(delay, self._later)
            return
        self.sent_times.append(now)
        activity = self.want
        if activity and self.plain:
            activity = {k: v for k, v in activity.items() if k not in NEW_FIELDS}
        nonce = uuid.uuid4().hex
        self.pending[nonce] = activity
        self.pipe.write(1, {'cmd': 'SET_ACTIVITY', 'nonce': nonce,
                            'args': {'pid': os.getpid(), 'activity': activity}})
        self.sent = self.want

    def _later(self):
        self.timer = None
        self.flush()

    def close(self):
        if self.ready:
            self.pipe.write(1, {'cmd': 'SET_ACTIVITY', 'nonce': uuid.uuid4().hex,
                                'args': {'pid': os.getpid(), 'activity': None}})
        if self.pipe:
            self.pipe.transport.close()


# --------------------------------------------------------------------------- main

def handle(discord, msg):
    if not isinstance(msg, dict):
        return
    if msg.get('type') == 'hello':
        cid = msg.get('clientId')
        if isinstance(cid, str) and re.fullmatch(r'\d{17,22}', cid):
            discord.set_client(cid)
        else:
            discord.status('error', text='Неверный Application ID')
    elif msg.get('type') == 'activity':
        a = msg.get('activity')
        discord.set(a if isinstance(a, dict) else None)


async def main():
    loop = asyncio.get_running_loop()
    discord = Discord()
    done = asyncio.Event()

    def reader():  # blocking stdin, in its own thread
        while True:
            try:
                msg = read()
            except ValueError:
                msg = None
            if msg is None:
                loop.call_soon_threadsafe(done.set)
                return
            loop.call_soon_threadsafe(handle, discord, msg)

    threading.Thread(target=reader, daemon=True).start()
    runner = asyncio.create_task(discord.run())
    await done.wait()   # the browser closed us: no more music
    log('browser disconnected, exiting')
    runner.cancel()
    discord.close()
    await asyncio.sleep(0.2)  # let the last write go out


if __name__ == '__main__':
    if '--install' in sys.argv or '--uninstall' in sys.argv:
        try:
            install() if '--install' in sys.argv else uninstall()
        except Exception as e:
            log('install failed:', repr(e))
            sys.exit(1)
    else:
        log('started')
        try:
            asyncio.run(main())
        except Exception as e:
            log('crash:', repr(e))
        os._exit(0)
