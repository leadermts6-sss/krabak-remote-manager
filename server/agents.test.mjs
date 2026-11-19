import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgentStore, isAgentApprovalExpired, trustedAgentAccessEnabled, validateAgentFrame, validateAgentInput } from './agents.mjs';

async function withStore(run, now = () => Date.now()) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'krabak-agent-test-'));
  try { await run(createAgentStore({ dataDir, now }), dataDir); }
  finally { await rm(dataDir, { recursive: true, force: true }); }
}

test('Agent enrollment is one-time and persists only code/token digests', async () => {
  await withStore(async (store, dataDir) => {
    const enrollment = store.createEnrollment('teacher@example.edu');
    assert.match(enrollment.code, /^[A-Za-z0-9_-]{40,50}$/);
    const file = path.join(dataDir, 'agents.json');
    assert.equal((await readFile(file, 'utf8')).includes(enrollment.code), false);

    const activated = store.activateEnrollment(enrollment.code, 'Teacher Laptop', true);
    assert.ok(activated);
    assert.equal(activated.device.ownerEmail, 'teacher@example.edu');
    assert.equal(activated.device.trustedAccess, true);
    assert.equal(activated.device.name, 'Teacher Laptop');
    assert.equal(store.activateEnrollment(enrollment.code, 'Teacher Laptop', true), null, 'the code is consumed');

    const saved = await readFile(file, 'utf8');
    assert.equal(saved.includes(enrollment.code), false);
    assert.equal(saved.includes(activated.token), false);
    assert.equal(store.authenticate(activated.token).id, activated.device.id);
    assert.equal(store.authenticate('not-a-token'), null);
    assert.equal(Object.hasOwn(store.list('teacher@example.edu')[0], 'tokenHash'), false);
  });
});

test('Agent owner scope and revocation are enforced', async () => {
  await withStore(async store => {
    const enrollment = store.createEnrollment('teacher@example.edu');
    const { device, token } = store.activateEnrollment(enrollment.code, 'Office PC', false);
    assert.equal(store.list('other@example.edu').length, 0);
    assert.equal(store.list('other@example.edu', true)[0].id, device.id);
    assert.equal(store.revoke(device.id, 'other@example.edu'), false);
    assert.equal(store.authenticate(token).id, device.id);
    assert.equal(store.revoke(device.id, 'teacher@example.edu'), true);
    assert.equal(store.authenticate(token), null);
    assert.equal(store.list('teacher@example.edu').length, 0);
  });
});

test('expired and malformed Agent enrollments cannot be activated', async () => {
  let current = 1_000;
  await withStore(async store => {
    const enrollment = store.createEnrollment('teacher@example.edu');
    assert.equal(store.activateEnrollment(enrollment.code, 'x', true), null, 'device name must be valid');
    current += 11 * 60_000;
    assert.equal(store.activateEnrollment(enrollment.code, 'Teacher Laptop', true), null, 'code must expire');
  }, () => current);
});

test('Agent input relay accepts only bounded mouse and keyboard events', () => {
  assert.deepEqual(validateAgentInput({ kind: 'move', x: 0, y: 65535 }), { kind: 'move', x: 0, y: 65535 });
  assert.deepEqual(validateAgentInput({ kind: 'button', button: 'left', down: true, x: 10, y: 20 }), { kind: 'button', button: 'left', down: true, x: 10, y: 20 });
  assert.deepEqual(validateAgentInput({ kind: 'wheel', delta: -120 }), { kind: 'wheel', delta: -120 });
  assert.deepEqual(validateAgentInput({ kind: 'key', virtualKey: 0x41, down: true }), { kind: 'key', virtualKey: 0x41, down: true });
  assert.equal(validateAgentInput({ kind: 'move', x: -1, y: 0 }), null);
  assert.equal(validateAgentInput({ kind: 'key', virtualKey: 0x5b, down: true }), null, 'Windows-key shortcuts are blocked');
  assert.equal(validateAgentInput({ kind: 'exec', command: 'whoami' }), null);
});

test('Agent screen relay rejects malformed, excessive, and out-of-range frames', () => {
  assert.equal(validateAgentFrame('aGVsbG8=', 640, 360), true);
  assert.equal(validateAgentFrame('not base64!', 640, 360), false);
  assert.equal(validateAgentFrame('a'.repeat(950_000), 640, 360), false);
  assert.equal(validateAgentFrame('aGVsbG8=', 0, 360), false);
  assert.equal(validateAgentFrame('aGVsbG8=', 4000, 2160), false);
});

test('only unanswered Agent consent requests expire at their deadline', () => {
  const pending = { host: { agent: true }, approved: false, approvalExpires: 60_000 };
  assert.equal(isAgentApprovalExpired(pending, 59_999), false);
  assert.equal(isAgentApprovalExpired(pending, 60_000), true);
  assert.equal(isAgentApprovalExpired({ ...pending, approved: true }, 60_000), false);
  assert.equal(isAgentApprovalExpired({ ...pending, host: { agent: false } }, 60_000), false);
});

test('trusted same-account Agent control requires an explicit server policy flag', () => {
  assert.equal(trustedAgentAccessEnabled({}), false);
  assert.equal(trustedAgentAccessEnabled({ KRABAK_AGENT_TRUSTED_ACCESS_ENABLED: 'true' }), false);
  assert.equal(trustedAgentAccessEnabled({ KRABAK_AGENT_TRUSTED_ACCESS_ENABLED: '1' }), true);
});
