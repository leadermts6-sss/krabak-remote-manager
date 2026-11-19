import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { MiniWebSocket } from './ws.mjs';

class SlowSocket extends EventEmitter {
  writableLength = 0;
  writes = 0;
  ended = false;
  setTimeout() {}
  write(buffer) { this.writes++; this.writableLength += buffer.length; return false; }
  end() { this.ended = true; }
}

test('WebSocket drops screen frames under backpressure and caps other queued output', () => {
  const socket = new SlowSocket();
  const ws = new MiniWebSocket(socket);
  assert.equal(ws.send({ type: 'screen-frame', frame: 'a'.repeat(600_000) }), true);
  assert.equal(ws.send({ type: 'screen-frame', frame: 'a'.repeat(600_000) }), true);
  const writesBeforeDrop = socket.writes;
  assert.equal(ws.send({ type: 'screen-frame', frame: 'a'.repeat(600_000) }), false);
  assert.equal(socket.writes, writesBeforeDrop, 'the next frame is dropped when the viewer cannot drain prior frames');
  assert.equal(ws.closed, false, 'video backpressure does not close a recoverable connection');

  socket.writableLength = 1_499_999;
  assert.equal(ws.send({ type: 'chat', text: 'x' }), false);
  assert.equal(ws.closed, true, 'non-media output closes instead of exceeding the queue cap');
  assert.equal(socket.ended, true);
});

test('WebSocket accepts client PONG keep-alive frames and continues reading text messages', () => {
  const socket = new SlowSocket();
  const ws = new MiniWebSocket(socket);
  const messages = [];
  ws.on('message', message => messages.push(message));

  const maskedFrame = (opcode, payload) => {
    const mask = Buffer.from([0x11, 0x22, 0x33, 0x44]);
    const source = Buffer.from(payload);
    const masked = Buffer.from(source);
    for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % mask.length];
    return Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | source.length]), mask, masked]);
  };
  const pong = maskedFrame(0x0a, Buffer.alloc(0));
  const pingMessage = maskedFrame(0x01, Buffer.from('{"type":"agent-ping"}'));
  socket.emit('data', Buffer.concat([pong, pingMessage]));

  assert.equal(ws.closed, false, 'an unsolicited PONG must keep the WebSocket open');
  assert.equal(socket.ended, false, 'the transport must not be ended on a client PONG');
  assert.deepEqual(messages, [{ type: 'agent-ping' }], 'the next application message must still be parsed');
});
