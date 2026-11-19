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
