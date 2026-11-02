const net = require('node:net');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
function frame(op, data) {
  const body = Buffer.from(JSON.stringify(data));
  const head = Buffer.alloc(8); head.writeUInt32LE(op); head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}
class Decoder {
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]); const out = [];
    while (this.buffer.length >= 8) {
      const size = this.buffer.readUInt32LE(4);
      if (size > 1024 * 1024) throw new Error('RPC frame too large');
      if (this.buffer.length < size + 8) break;
      out.push([this.buffer.readUInt32LE(0), JSON.parse(this.buffer.subarray(8, size + 8).toString())]);
      this.buffer = this.buffer.subarray(size + 8);
    } return out;
  }
}
class RPC extends EventEmitter {
  constructor(id) { super(); this.id = id; this.ready = false; }
  async connect() {
    for (let i = 0; i < 10; i++) {
      if (this.stopped) return;
      try { await this.open(i); return; } catch {}
    }
    throw new Error('Открой Discord на компьютере. Подключение не найдено.');
  }
  open(i) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection('\\\\?\\pipe\\discord-ipc-' + i);
      const decoder = new Decoder(); let done = false;
      const timer = setTimeout(() => fail(new Error('RPC timeout')), 4000);
      const fail = err => { clearTimeout(timer); socket.destroy(); if (!done) { done = true; reject(err); } };
      socket.on('connect', () => socket.write(frame(0, { v: 1, client_id: this.id })));
      socket.on('error', fail);
      socket.on('close', () => {
        clearTimeout(timer);
        if (!done) { done = true; reject(new Error('RPC closed')); }
        if (this.socket === socket) { this.ready = false; this.emit('disconnected'); }
      });
      socket.on('data', chunk => {
        try {
          for (const [op, data] of decoder.push(chunk)) {
            if (op === 3) socket.write(frame(4, data));
            if (op === 2) { fail(new Error('RPC rejected')); continue; }
            if (data.evt === 'ERROR') this.emit('status', data.data?.message || 'Ошибка Discord RPC');
            if (data.evt === 'READY' && !done) {
              done = true; clearTimeout(timer); this.socket = socket; this.ready = true; resolve();
            }
          }
        } catch (err) { fail(err); }
      });
    });
  }
  activity(activity) {
    if (this.ready) this.socket.write(frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: randomUUID() }));
  }
  close() { this.stopped = true; this.activity(null); this.socket?.end(); this.ready = false; }
}
module.exports = { RPC, frame, Decoder };
