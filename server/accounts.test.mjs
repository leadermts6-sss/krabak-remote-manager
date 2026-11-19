import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krabak-account-tests-'));
const dataDir = path.join(root, 'data');
process.env.KRABAK_DATA_DIR = dataDir;

let accounts;
let auth;

before(async () => {
  accounts = await import('./accounts.mjs');
  auth = await import('./auth.mjs');
});

beforeEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

test('teacher password policy accepts only 12-128 ASCII letters and digits containing both', () => {
  assert.deepEqual(accounts.validateTeacherPassword('Teacher123456'), { ok: true });
  assert.deepEqual(accounts.validateTeacherPassword('A1bcdefghijk'), { ok: true });
  assert.equal(accounts.validateTeacherPassword('A' + '1'.repeat(127)).ok, true);
  assert.equal(accounts.validateTeacherPassword('abcdefghijkl').ok, false);
  assert.equal(accounts.validateTeacherPassword('123456789012').ok, false);
  assert.equal(accounts.validateTeacherPassword('Teacher1234').ok, false);
  assert.equal(accounts.validateTeacherPassword('Teacher12345'.repeat(11)).ok, false);
  assert.equal(accounts.validateTeacherPassword('Teacher12345!').ok, false);
  assert.equal(accounts.validateTeacherPassword('Teacher 12345').ok, false);
  assert.equal(accounts.validateTeacherPassword('Teacher１２３４５６').ok, false);
  assert.equal(accounts.validateTeacherPassword('').ok, false);
  assert.equal(accounts.validateTeacherPassword(null).ok, false);
});

test('email is normalized and duplicate addresses are rejected case-insensitively', () => {
  const created = accounts.createTeacher('  Teacher.One@Example.EDU  ');
  assert.equal(created.user.email, 'teacher.one@example.edu');
  assert.throws(() => accounts.createTeacher('TEACHER.ONE@example.edu'), /already exists/i);
  assert.throws(() => accounts.createTeacher('invalid-email'), /invalid email/i);
});

test('activation persists only hashes with restrictive data-directory and file modes', () => {
  const activation = accounts.createTeacher('teacher@example.edu');
  const password = 'SchoolTeacher123';
  const activated = accounts.activateTeacher('teacher@example.edu', activation.activationCode, password);
  assert.equal(activated.status, 'active');

  const file = path.join(dataDir, 'users.json');
  const raw = fs.readFileSync(file, 'utf8');
  const records = JSON.parse(raw);
  assert.equal(records.length, 1);
  assert.match(raw, /"passwordHash"/);
  assert.match(raw, /"activationHash"/);
  assert.doesNotMatch(raw, new RegExp(password));
  assert.doesNotMatch(raw, new RegExp(activation.activationCode));
  assert.deepEqual(accounts.listTeachers().map(x => x.email), ['teacher@example.edu']);
  assert.equal(Object.hasOwn(accounts.listTeachers()[0], 'passwordHash'), false);
  assert.equal(Object.hasOwn(accounts.listTeachers()[0], 'activationHash'), false);
  assert.equal(accounts.listTeachers()[0].mfaEnabled, false);

  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(dataDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  }
});

test('activation code is one-time even when two consumers race', async () => {
  const issued = accounts.createTeacher('race@example.edu');
  const outcomes = await Promise.allSettled([
    Promise.resolve().then(() => accounts.activateTeacher('race@example.edu', issued.activationCode, 'TeacherRace123')),
    Promise.resolve().then(() => accounts.activateTeacher('race@example.edu', issued.activationCode, 'TeacherRace456')),
  ]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(x => x.status === 'rejected').length, 1);
});

test('invalid and expired activation codes fail without activating an account', () => {
  const issued = accounts.createTeacher('expiry@example.edu');
  assert.throws(() => accounts.activateTeacher('expiry@example.edu', 'not-the-code', 'TeacherExpire123'), /invalid or expired/i);

  const file = path.join(dataDir, 'users.json');
  const records = JSON.parse(fs.readFileSync(file, 'utf8'));
  records[0].activationExpiresAt = new Date(Date.now() - 1).toISOString();
  fs.writeFileSync(file, JSON.stringify(records));

  assert.throws(() => accounts.activateTeacher('expiry@example.edu', issued.activationCode, 'TeacherExpire123'), /invalid or expired/i);
  assert.equal(accounts.listTeachers()[0].status, 'pending');
});

test('activation is single-use and cannot replace the selected password', () => {
  const issued = accounts.createTeacher('once@example.edu');
  accounts.activateTeacher('once@example.edu', issued.activationCode, 'TeacherOnce123');
  assert.throws(() => accounts.activateTeacher('once@example.edu', issued.activationCode, 'TeacherOther123'), /invalid or expired/i);
  const credential = accounts.getTeacherForAuth('once@example.edu');
  assert.equal(accounts.verifyTeacherPassword('TeacherOnce123', credential), true);
  assert.equal(accounts.verifyTeacherPassword('TeacherOther123', credential), false);
});

test('disable prevents authentication and cannot be repeated', () => {
  const issued = accounts.createTeacher('disabled@example.edu');
  accounts.activateTeacher('disabled@example.edu', issued.activationCode, 'TeacherDisable123');
  const user = accounts.listTeachers()[0];
  assert.equal(accounts.disableTeacher(user.id), true);
  assert.equal(accounts.getTeacherForAuth('disabled@example.edu'), null);
  assert.equal(accounts.disableTeacher(user.id), false);
  assert.equal(accounts.disableTeacher('missing-user-id'), false);
});

test('reissue invalidates old activation, clears prior access, and accepts the new code once', () => {
  const first = accounts.createTeacher('reset@example.edu');
  accounts.activateTeacher('reset@example.edu', first.activationCode, 'TeacherReset123');
  const user = accounts.listTeachers()[0];
  const pending = accounts.reissueActivation(user.id);
  assert.equal(accounts.listTeachers()[0].status, 'pending');
  assert.equal(accounts.getTeacherForAuth('reset@example.edu'), null);
  assert.throws(() => accounts.activateTeacher('reset@example.edu', first.activationCode, 'TeacherReset456'), /invalid or expired/i);
  accounts.activateTeacher('reset@example.edu', pending.activationCode, 'TeacherReset456');
  assert.equal(accounts.verifyTeacherPassword('TeacherReset456', accounts.getTeacherForAuth('reset@example.edu')), true);
});

test('pending teacher activation can be reissued after a code is lost or expires', () => {
  const first = accounts.createTeacher('pending-reset@example.edu');
  const user = accounts.listTeachers()[0];
  const renewed = accounts.reissueActivation(user.id);
  assert.equal(accounts.listTeachers()[0].status, 'pending');
  assert.throws(() => accounts.activateTeacher('pending-reset@example.edu', first.activationCode, 'TeacherPending123'), /invalid or expired/i);
  accounts.activateTeacher('pending-reset@example.edu', renewed.activationCode, 'TeacherRenewed123');
  assert.equal(accounts.verifyTeacherPassword('TeacherRenewed123', accounts.getTeacherForAuth('pending-reset@example.edu')), true);
});

test('teacher lifecycle leaves the administrator credential file byte-for-byte unchanged', () => {
  auth.writeAdmin('admin@example.edu', 'Existing-Admin-Password!23');
  assert.throws(() => accounts.createTeacher('ADMIN@example.edu'), /already exists/i);
  const file = path.join(dataDir, 'admin.json');
  const beforeBytes = fs.readFileSync(file);
  const issued = accounts.createTeacher('persist@example.edu');
  accounts.activateTeacher('persist@example.edu', issued.activationCode, 'TeacherPersist123');
  accounts.reissueActivation(accounts.listTeachers()[0].id);
  assert.deepEqual(fs.readFileSync(file), beforeBytes);
  assert.equal(auth.verifyPassword('Existing-Admin-Password!23', auth.readAdmin()), true);
});
