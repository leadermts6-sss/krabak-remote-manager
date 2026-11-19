import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { MiniWebSocket } from './ws.mjs';

class SlowSocket extends EventEmitter {
  writableLength = 0;
  writable = true;
  destroyed = false;
  writableEnded = false;
  writes = 0;
  ended = false;
  endData = null;
  writtenData = [];
  setTimeout() {}
  write(buffer) { this.writes++; this.writableLength += buffer.length; this.writtenData.push(Buffer.from(buffer)); return false; }
  end(buffer) { this.ended = true; this.writableEnded = true; this.writable = false; this.endData = buffer ? Buffer.from(buffer) : null; }
  destroy() { this.destroyed = true; this.writable = false; }
}

function maskedFrame(opcode, payload) {
  const source = Buffer.from(payload);
  const mask = Buffer.from([0x11, 0x22, 0x33, 0x44]);
  const masked = Buffer.from(source);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % mask.length];
  const header = source.length < 126
    ? Buffer.from([0x80 | opcode, 0x80 | source.length])
    : Buffer.from([0x80 | opcode, 0x80 | 126, source.length >> 8, source.length & 0xff]);
  return Buffer.concat([header, mask, masked]);
}

function assertServerClose(socket, ws, statusCode) {
  assert.equal(ws.closed, true);
  assert.deepEqual(socket.writtenData.at(-1), Buffer.from([0x88, 0x02, statusCode >> 8, statusCode & 0xff]));
  socket.emit('data', maskedFrame(0x8, Buffer.from([0x03, 0xe8])));
  assert.equal(socket.ended, true);
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
  assert.equal(socket.ended, false, 'the close handshake waits for the peer response');
  assert.deepEqual(socket.writtenData.at(-1), Buffer.from([0x88, 0x00]));
  socket.emit('data', maskedFrame(0x8, Buffer.from([0x03, 0xe8])));
  assert.equal(socket.ended, true);
});

test('WebSocket accepts client PONG keep-alive frames and continues reading text messages', () => {
  const socket = new SlowSocket();
  const ws = new MiniWebSocket(socket);
  const messages = [];
  ws.on('message', message => messages.push(message));

  const pong = maskedFrame(0x0a, Buffer.alloc(0));
  const pingMessage = maskedFrame(0x01, Buffer.from('{"type":"agent-ping"}'));
  socket.emit('data', Buffer.concat([pong, pingMessage]));

  assert.equal(ws.closed, false, 'an unsolicited PONG must keep the WebSocket open');
  assert.equal(socket.ended, false, 'the transport must not be ended on a client PONG');
  assert.deepEqual(messages, [{ type: 'agent-ping' }], 'the next application message must still be parsed');
});

test('WebSocket waits for the peer close response before ending a server-initiated close', () => {
  const socket = new SlowSocket();
  const ws = new MiniWebSocket(socket);

  ws.close();

  assert.equal(ws.closed, true);
  assert.equal(socket.ended, false, 'the server must leave the read side open for the peer close response');
  assert.deepEqual(socket.writtenData.at(-1), Buffer.from([0x88, 0x00]));

  socket.emit('data', maskedFrame(0x8, Buffer.from([0x03, 0xe8])));

  assert.equal(socket.ended, true, 'the server ends TCP after receiving the peer close response');
  assert.equal(socket.endData, null, 'the server must not send a second close frame');
});

test('WebSocket aborts a server-initiated handshake when the peer Close response is malformed', () => {
  const socket = new SlowSocket();
  const ws = new MiniWebSocket(socket);

  ws.close();
  socket.emit('data', maskedFrame(0x8, Buffer.from([0x03, 0xed]))); // 1005 is reserved.

  assert.equal(socket.destroyed, true, 'an invalid close response must not complete the handshake');
  assert.equal(socket.ended, false);
});

test('WebSocket aborts a server-initiated handshake when the peer Close frame is oversized', () => {
  const socket = new SlowSocket();
  const ws = new MiniWebSocket(socket);

  ws.close();
  socket.emit('data', maskedFrame(0x8, Buffer.alloc(126)));

  assert.equal(socket.destroyed, true, 'an oversized control frame must not leave a malformed close handshake open');
  assert.equal(socket.ended, false);
});

test('WebSocket replies to a client close frame before ending the transport', () => {
  const socket = new SlowSocket();
  const ws = new MiniWebSocket(socket);
  socket.emit('data', maskedFrame(0x8, Buffer.alloc(0)));

  assert.equal(ws.closed, true);
  assert.deepEqual(socket.endData, Buffer.from([0x88, 0x00]));
});

test('WebSocket reports a protocol error for an invalid one-byte close payload', () => {
  const socket = new SlowSocket();
  const ws = new MiniWebSocket(socket);
  socket.emit('data', maskedFrame(0x8, Buffer.from([0x01])));

  assert.equal(ws.closed, true);
  assert.deepEqual(socket.endData, Buffer.from([0x88, 0x02, 0x03, 0xea]));
});

test('WebSocket rejects reserved close status codes with 1002', () => {
  const socket = new SlowSocket();
  const ws = new MiniWebSocket(socket);

  socket.emit('data', maskedFrame(0x8, Buffer.from([0x03, 0xed]))); // 1005 is reserved.

  assert.deepEqual(socket.endData, Buffer.from([0x88, 0x02, 0x03, 0xea]));
});

test('WebSocket rejects invalid UTF-8 in a close reason with 1007', () => {
  const socket = new SlowSocket();
  const ws = new MiniWebSocket(socket);

  socket.emit('data', maskedFrame(0x8, Buffer.from([0x03, 0xe8, 0xff])));

  assert.equal(ws.closed, true);
  assert.deepEqual(socket.endData, Buffer.from([0x88, 0x02, 0x03, 0xef]));
});

test('WebSocket reports protocol errors for reserved opcodes and unsupported binary data', () => {
  const reservedSocket = new SlowSocket();
  const reservedWs = new MiniWebSocket(reservedSocket);
  reservedSocket.emit('data', maskedFrame(0x3, Buffer.alloc(0)));
  assertServerClose(reservedSocket, reservedWs, 1002);

  const binarySocket = new SlowSocket();
  const binaryWs = new MiniWebSocket(binarySocket);
  binarySocket.emit('data', maskedFrame(0x2, Buffer.from('binary')));
  assertServerClose(binarySocket, binaryWs, 1003);
});
