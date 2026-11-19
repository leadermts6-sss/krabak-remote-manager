import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(projectRoot, 'server', 'index.mjs');
const adminEmail = 'admin@example.edu';
const adminPassword = 'Existing-Admin!Password42';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

let dataDir;
let port;
let origin;
let child;
let adminCookie;
before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'krabak-remote-auth-test-'));
  port = await availablePort();
  origin = 'http://127.0.0.1:' + port;
  const adminRecord = { email: adminEmail, ...hashPassword(adminPassword), createdAt: new Date().toISOString() };
  await writeFile(path.join(dataDir, 'admin.json'), JSON.stringify(adminRecord), { mode: 0o600 });
  child = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), KRABAK_DATA_DIR: dataDir, KRABAK_PUBLIC_ORIGIN: origin },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error('Backend exited before readiness');
    try {
      const response = await fetch(origin + '/api/status');
      if (response.ok) { ready = true; break; }
    } catch {}
    await wait(50);
  }
  assert.equal(ready, true, 'backend should bind to the test loopback port');
  adminCookie = await login(adminEmail, adminPassword);
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await once(child, 'close');
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const chosen = server.address().port;
      server.close(error => error ? reject(error) : resolve(chosen));
    });
  });
}

async function api(route, { method = 'GET', body, cookie } = {}) {
  const headers = { origin };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = 'krabak_session=' + cookie;
  const response = await fetch(origin + route, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  const setCookie = response.headers.get('set-cookie');
  const session = setCookie?.match(/(?:^|,\s*)krabak_session=([^;,]*)/)?.[1];
  return { status: response.status, payload, setCookie, cookie: session || null };
}

async function login(email, password) {
  const response = await api('/api/login', { method: 'POST', body: { email, password } });
  assert.equal(response.status, 200, 'valid credentials should create a session');
  assert.ok(response.cookie, 'login should return a session cookie');
  return response.cookie;
}

async function createPending(email) {
  const response = await api('/api/users', {
    method: 'POST',
    cookie: adminCookie,
    body: { email },
  });
  assert.equal(response.status, 201);
  assert.match(response.payload.activationCode, /^[A-Za-z0-9_-]{40,50}$/);
  return { id: response.payload.user.id, activationCode: response.payload.activationCode };
}

async function activate(email, activationCode, password) {
  return api('/api/activate', {
    method: 'POST',
    body: { email, activationCode, password },
  });
}

async function createActiveTeacher(email, password = 'TeacherPassword123') {
  const pending = await createPending(email);
  const response = await activate(email, pending.activationCode, password);
  assert.equal(response.status, 200);
  return { id: pending.id, password, cookie: await login(email, password) };
}

async function connectWebSocket(cookie = null) {
  const socket = await new Promise((resolve, reject) => {
    const netSocket = Promise.resolve().then(() => {
      const client = createConnection({ host: '127.0.0.1', port });
      const key = crypto.randomBytes(16).toString('base64');
      let buffer = Buffer.alloc(0);
      let handshakeComplete = false;
      const messages = [];
      const waiters = [];
      let closeResolve;
      const closed = new Promise(done => { closeResolve = done; });

      const apiSocket = {
        messages,
        send(value) {
          const payload = Buffer.from(JSON.stringify(value));
          const mask = crypto.randomBytes(4);
          let header;
          if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
          else {
            header = Buffer.from([0x81, 0xfe, payload.length >> 8, payload.length & 0xff]);
          }
          const masked = Buffer.alloc(payload.length);
          for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
          client.write(Buffer.concat([header, mask, masked]));
        },
        waitFor(type, timeoutMs = 2500) {
          const found = messages.find(item => item.type === type);
          if (found) return Promise.resolve(found);
          return new Promise((done, fail) => {
            const timer = setTimeout(() => fail(new Error('Timed out waiting for WebSocket message: ' + type)), timeoutMs);
            waiters.push({ type, done: value => { clearTimeout(timer); done(value); } });
          });
        },
        waitForClose(timeoutMs = 2500) {
          return Promise.race([
            closed,
            wait(timeoutMs).then(() => { throw new Error('Timed out waiting for WebSocket close'); }),
          ]);
        },
        close() { client.destroy(); },
      };

      const handleFrameData = chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        if (!handshakeComplete) {
          const end = buffer.indexOf('\r\n\r\n');
          if (end < 0) return;
          const response = buffer.subarray(0, end).toString('utf8');
          if (!response.startsWith('HTTP/1.1 101')) {
            reject(new Error('WebSocket handshake failed: ' + response.split('\r\n')[0]));
            client.destroy();
            return;
          }
          buffer = buffer.subarray(end + 4);
          handshakeComplete = true;
          resolve(apiSocket);
        }
        while (buffer.length >= 2) {
          const opcode = buffer[0] & 0x0f;
          let size = buffer[1] & 0x7f;
          let offset = 2;
          if (size === 126) {
            if (buffer.length < 4) return;
            size = buffer.readUInt16BE(2);
            offset = 4;
          } else if (size === 127) {
            if (buffer.length < 10) return;
            size = Number(buffer.readBigUInt64BE(2));
            offset = 10;
          }
          if (buffer.length < offset + size) return;
          const payload = buffer.subarray(offset, offset + size);
          buffer = buffer.subarray(offset + size);
          if (opcode === 0x8) { client.end(); continue; }
          if (opcode !== 0x1) continue;
          const message = JSON.parse(payload.toString('utf8'));
          messages.push(message);
          for (let i = waiters.length - 1; i >= 0; i--) {
            if (waiters[i].type === message.type) {
              const waiter = waiters.splice(i, 1)[0];
              waiter.done(message);
            }
          }
        }
      };

      client.on('connect', () => {
        const cookieHeader = cookie ? 'Cookie: krabak_session=' + cookie + '\r\n' : '';
        client.write(
          'GET /ws HTTP/1.1\r\n' +
          'Host: 127.0.0.1:' + port + '\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Key: ' + key + '\r\n' +
          'Sec-WebSocket-Version: 13\r\n' +
          'Origin: ' + origin + '\r\n' +
          cookieHeader + '\r\n'
        );
      });
      client.on('data', handleFrameData);
      client.on('error', error => {
        if (!handshakeComplete) reject(error);
      });
      client.on('close', () => closeResolve());
    });
    netSocket.catch(reject);
  });
  return socket;
}

test('status returns the current account only for its valid session without requiring a failed /me request', async () => {
  const anonymous = await api('/api/status');
  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.payload.user, null);
  const authenticated = await api('/api/status', { cookie: adminCookie });
  assert.deepEqual(authenticated.payload.user, { email: adminEmail, role: 'admin' });
});

test('admin login remains compatible, role is explicit, and logout invalidates the session', { timeout: 20000 }, async () => {
  const cookie = await login(adminEmail, adminPassword);
  const me = await api('/api/me', { cookie });
  assert.deepEqual(me.payload.user, { email: adminEmail, role: 'admin' });

  const logout = await api('/api/logout', { method: 'POST', cookie, body: {} });
  assert.equal(logout.status, 200);
  assert.match(logout.setCookie || '', /Max-Age=0/);
  assert.equal((await api('/api/me', { cookie })).status, 401);
});

test('activation is one-time, does not create a session, and teachers can sign in and log out', { timeout: 20000 }, async () => {
  const email = 'teacher.one@example.edu';
  const pending = await createPending(email);
  const listed = await api('/api/users', { cookie: adminCookie });
  assert.equal(listed.status, 200);
  assert.equal(listed.payload.users.some(user => user.email === email), true);
  const record = listed.payload.users.find(user => user.email === email);
  assert.equal(Object.hasOwn(record, 'passwordHash'), false);
  assert.equal(Object.hasOwn(record, 'activationHash'), false);
  assert.equal(JSON.stringify(listed.payload).includes(pending.activationCode), false);

  const activated = await activate(email, pending.activationCode, 'TeacherPassword123');
  assert.equal(activated.status, 200);
  assert.equal(activated.cookie, null, 'activation should not log the teacher in automatically');
  assert.deepEqual(activated.payload, { ok: true });
  const reused = await activate(email, pending.activationCode, 'TeacherPassword456');
  assert.equal(reused.status, 400);
  assert.equal(reused.payload.error, 'Invalid or expired activation code');

  const cookie = await login(email, 'TeacherPassword123');
  assert.deepEqual((await api('/api/me', { cookie })).payload.user, { email, role: 'teacher' });
  assert.equal((await api('/api/logout', { method: 'POST', cookie, body: {} })).status, 200);
  assert.equal((await api('/api/me', { cookie })).status, 401);
});

test('admin can issue a replacement activation code for a pending teacher', { timeout: 20000 }, async () => {
  const email = 'teacher.pending-reset@example.edu';
  const original = await createPending(email);
  const listed = await api('/api/users', { cookie: adminCookie });
  const user = listed.payload.users.find(item => item.email === email);
  const renewed = await api('/api/users/' + user.id + '/activation', { method: 'POST', cookie: adminCookie, body: {} });
  assert.equal(renewed.status, 200);
  assert.equal((await activate(email, original.activationCode, 'TeacherPassword123')).status, 400);
  assert.equal((await activate(email, renewed.payload.activationCode, 'TeacherPassword123')).status, 200);
});

test('activation errors are generic for unknown email, wrong code, and expired code', { timeout: 20000 }, async () => {
  const email = 'teacher.expiry@example.edu';
  const pending = await createPending(email);
  const wrong = await activate(email, 'wrong-activation-code', 'TeacherPassword123');
  const unknown = await activate('nobody@example.edu', 'wrong-activation-code', 'TeacherPassword123');
  assert.equal(wrong.status, 400);
  assert.equal(unknown.status, 400);
  assert.deepEqual(unknown.payload, wrong.payload);

  const file = path.join(dataDir, 'users.json');
  const users = JSON.parse(await readFile(file, 'utf8'));
  users.find(user => user.id === pending.id).activationExpiresAt = new Date(Date.now() - 1000).toISOString();
  await writeFile(file, JSON.stringify(users), { mode: 0o600 });
  const expired = await activate(email, pending.activationCode, 'TeacherPassword123');
  assert.equal(expired.status, 400);
  assert.deepEqual(expired.payload, wrong.payload);
});

test('teacher access is role-scoped, active Hosts are owner-scoped, and Host consent remains required', { timeout: 30000 }, async () => {
  const teacherA = await createActiveTeacher('teacher.a@example.edu');
  const teacherB = await createActiveTeacher('teacher.b@example.edu');

  assert.equal((await api('/api/users', { cookie: teacherA.cookie })).status, 403);
  assert.equal((await api('/api/users', { method: 'POST', cookie: teacherA.cookie, body: { email: 'teacher.c@example.edu' } })).status, 403);
  assert.equal((await api('/api/host/register', { method: 'POST', body: { name: 'Unauthenticated Host' } })).status, 401);

  const hostA = await api('/api/host/register', { method: 'POST', cookie: teacherA.cookie, body: { name: 'Teacher A Host' } });
  const hostB = await api('/api/host/register', { method: 'POST', cookie: teacherB.cookie, body: { name: 'Teacher B Host' } });
  assert.equal(hostA.status, 201);
  assert.equal(hostB.status, 201);
  const wsA = await connectWebSocket();
  const wsB = await connectWebSocket();
  wsA.send({ type: 'host-hello', token: hostA.payload.token });
  wsB.send({ type: 'host-hello', token: hostB.payload.token });
  await Promise.all([wsA.waitFor('host-hello-ok'), wsB.waitFor('host-hello-ok')]);

  const visibleA = await api('/api/hosts', { cookie: teacherA.cookie });
  const visibleB = await api('/api/hosts', { cookie: teacherB.cookie });
  const visibleAdmin = await api('/api/hosts', { cookie: adminCookie });
  assert.deepEqual(visibleA.payload.hosts.map(host => host.name), ['Teacher A Host']);
  assert.deepEqual(visibleB.payload.hosts.map(host => host.name), ['Teacher B Host']);
  assert.equal(visibleAdmin.payload.hosts.length, 2);
  assert.equal(Object.hasOwn(visibleA.payload.hosts[0], 'token'), false);
  assert.equal(Object.hasOwn(visibleA.payload.hosts[0], 'code'), false);

  const viewer = await connectWebSocket(teacherA.cookie);
  viewer.send({ type: 'viewer-hello' });
  await viewer.waitFor('viewer-hello-ok');
  const requested = await api('/api/sessions', { method: 'POST', cookie: teacherA.cookie, body: { code: hostB.payload.code } });
  assert.equal(requested.status, 201);
  assert.equal(requested.payload.status, 'pending');
  viewer.send({ type: 'watch', sessionId: requested.payload.id });
  const invitation = await wsB.waitFor('invite');
  assert.equal(invitation.requester, 'teacher.a@example.edu');
  assert.equal(viewer.messages.some(message => message.type === 'accepted'), false, 'server must wait for the Host to approve');
  wsB.send({ type: 'accept', sessionId: requested.payload.id });
  await viewer.waitFor('accepted');

  const auditA = await api('/api/audit', { cookie: teacherA.cookie });
  const auditB = await api('/api/audit', { cookie: teacherB.cookie });
  const auditAdmin = await api('/api/audit', { cookie: adminCookie });
  assert.ok(auditA.payload.events.some(event => event.type === 'session' && event.title === 'ร้องขอการเชื่อมต่อ'));
  assert.ok(auditB.payload.events.some(event => event.type === 'session' && event.title === 'ร้องขอการเชื่อมต่อ'));
  assert.equal(auditAdmin.payload.events.length >= auditA.payload.events.length, true);

  const users = await api('/api/users', { cookie: adminCookie });
  const teacherBRecord = users.payload.users.find(user => user.email === 'teacher.b@example.edu');
  const reissued = await api('/api/users/' + teacherBRecord.id + '/activation', { method: 'POST', cookie: adminCookie, body: {} });
  assert.equal(reissued.status, 200);
  assert.equal((await api('/api/me', { cookie: teacherB.cookie })).status, 401);
  await wsB.waitForClose();
  await viewer.waitFor('ended');
  assert.equal((await api('/api/hosts', { cookie: adminCookie })).payload.hosts.some(host => host.name === 'Teacher B Host'), false);

  const newActivation = await activate('teacher.b@example.edu', reissued.payload.activationCode, 'TeacherPassword789');
  assert.equal(newActivation.status, 200);
  const teacherBNewCookie = await login('teacher.b@example.edu', 'TeacherPassword789');
  assert.deepEqual((await api('/api/me', { cookie: teacherBNewCookie })).payload.user, { email: 'teacher.b@example.edu', role: 'teacher' });

  const newHost = await api('/api/host/register', { method: 'POST', cookie: teacherBNewCookie, body: { name: 'Teacher B Reconnected Host' } });
  const wsNew = await connectWebSocket();
  wsNew.send({ type: 'host-hello', token: newHost.payload.token });
  await wsNew.waitFor('host-hello-ok');
  const disabled = await api('/api/users/' + teacherBRecord.id + '/disable', { method: 'POST', cookie: adminCookie, body: {} });
  assert.equal(disabled.status, 200);
  assert.equal((await api('/api/me', { cookie: teacherBNewCookie })).status, 401);
  await wsNew.waitForClose();
  assert.equal((await api('/api/hosts', { cookie: adminCookie })).payload.hosts.some(host => host.name === 'Teacher B Reconnected Host'), false);

  viewer.close();
  wsA.close();
  wsB.close();
});

test('Windows Agent enrollment, same-owner access, foreign approval, relay limits, and revocation', { timeout: 30000 }, async () => {
  const owner = { cookie: adminCookie, email: adminEmail };
  const guest = await createActiveTeacher('agent.guest@example.edu');
  const enrollment = await api('/api/agents/enrollment', { method: 'POST', cookie: owner.cookie, body: {} });
  assert.equal(enrollment.status, 201);
  assert.match(enrollment.payload.code, /^[A-Za-z0-9_-]{40,50}$/);

  const activated = await api('/api/agents/enroll', {
    method: 'POST',
    body: { code: enrollment.payload.code, name: 'Agent Owner PC', trustedAccess: true },
  });
  assert.equal(activated.status, 201);
  assert.match(activated.payload.token, /^[A-Za-z0-9_-]{40,50}$/);
  const registry = await readFile(path.join(dataDir, 'agents.json'), 'utf8');
  assert.equal(registry.includes(enrollment.payload.code), false);
  assert.equal(registry.includes(activated.payload.token), false);

  const agent = await connectWebSocket();
  agent.send({ type: 'agent-hello', token: activated.payload.token });
  const agentHello = await agent.waitFor('agent-hello-ok');
  assert.equal(agentHello.deviceId, activated.payload.device.id);
  assert.match(agentHello.pairingCode, /^[A-F0-9]{8}$/);

  const ownerDevices = await api('/api/hosts', { cookie: owner.cookie });
  const guestDevices = await api('/api/hosts', { cookie: guest.cookie });
  assert.equal(ownerDevices.payload.hosts.find(item => item.id === activated.payload.device.id)?.type, 'agent');
  assert.equal(guestDevices.payload.hosts.some(item => item.id === activated.payload.device.id), false);

  const ownerViewer = await connectWebSocket(owner.cookie);
  ownerViewer.send({ type: 'viewer-hello' });
  await ownerViewer.waitFor('viewer-hello-ok');
  const ownerSession = await api('/api/sessions', {
    method: 'POST', cookie: owner.cookie, body: { deviceId: activated.payload.device.id },
  });
  assert.equal(ownerSession.status, 201);
  assert.equal(ownerSession.payload.status, 'approved');
  ownerViewer.send({ type: 'watch', sessionId: ownerSession.payload.id });
  await ownerViewer.waitFor('accepted');
  const ownerStarted = await agent.waitFor('agent-session-start');
  assert.equal(ownerStarted.sessionId, ownerSession.payload.id);
  agent.send({ type: 'screen-frame', sessionId: ownerSession.payload.id, frame: 'aGVsbG8=', width: 640, height: 360 });
  assert.equal((await ownerViewer.waitFor('screen-frame')).width, 640);
  ownerViewer.send({ type: 'input', sessionId: ownerSession.payload.id, input: { kind: 'move', x: 30000, y: 40000 } });
  assert.equal((await agent.waitFor('input')).input.kind, 'move');
  ownerViewer.send({ type: 'input', sessionId: ownerSession.payload.id, input: { kind: 'exec', command: 'whoami' } });
  await wait(100);
  assert.equal(agent.messages.some(item => item.type === 'input' && item.input?.kind === 'exec'), false);

  assert.equal((await api('/api/sessions', {
    method: 'POST', cookie: guest.cookie, body: { deviceId: activated.payload.device.id },
  })).status, 403);
  ownerViewer.send({ type: 'end', sessionId: ownerSession.payload.id });
  await agent.waitFor('ended');

  const guestViewer = await connectWebSocket(guest.cookie);
  guestViewer.send({ type: 'viewer-hello' });
  await guestViewer.waitFor('viewer-hello-ok');
  const guestSession = await api('/api/sessions', {
    method: 'POST', cookie: guest.cookie, body: { code: agentHello.pairingCode },
  });
  assert.equal(guestSession.status, 201);
  assert.equal(guestSession.payload.status, 'pending');
  guestViewer.send({ type: 'watch', sessionId: guestSession.payload.id });
  const invite = await agent.waitFor('invite');
  assert.equal(invite.requester, 'agent.guest@example.edu');
  assert.equal(guestViewer.messages.some(item => item.type === 'accepted'), false);
  agent.send({ type: 'accept', sessionId: guestSession.payload.id });
  await guestViewer.waitFor('accepted');

  for (let attempt = 0; attempt < 11; attempt++) {
    const invalidPair = await api('/api/sessions', {
      method: 'POST', cookie: guest.cookie, body: { code: 'FFFFFFFF' },
    });
    assert.equal(invalidPair.status, 404, 'invalid code remains indistinguishable before the account limit');
  }
  const rateLimitedPair = await api('/api/sessions', {
    method: 'POST', cookie: guest.cookie, body: { code: 'FFFFFFFF' },
  });
  assert.equal(rateLimitedPair.status, 429);

  const revoked = await api('/api/agents/' + activated.payload.device.id + '/revoke', {
    method: 'POST', cookie: owner.cookie, body: {},
  });
  assert.equal(revoked.status, 200);
  await agent.waitForClose();
  await guestViewer.waitFor('ended');
  assert.equal((await api('/api/hosts', { cookie: owner.cookie })).payload.hosts.some(item => item.id === activated.payload.device.id), false);

  ownerViewer.close();
  guestViewer.close();
});
