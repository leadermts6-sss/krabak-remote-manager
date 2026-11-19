import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'krabak-mfa-test-'));
process.env.KRABAK_DATA_DIR = dataDir;
const { createTotpSecret, makeTotpUrl, createTotpCode, createRecoveryCodes, hashRecoveryCode, verifyTotp, encryptTotpSecret, decryptTotpSecret } = await import('./mfa.mjs');

test('TOTP matches the RFC 6238 SHA-1 test vector and tolerates one clock step', () => {
  const base32Secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(verifyTotp(base32Secret, '287082', 59_000), true);
  assert.equal(verifyTotp(base32Secret, '287082', 89_000), true);
  assert.equal(verifyTotp(base32Secret, '111111', 59_000), false);
});

test('TOTP setup secret is base32 and URI-encodes account details', () => {
  const secret = createTotpSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  const uri = new URL(makeTotpUrl(secret, 'test@example.edu'));
  assert.equal(uri.hostname, 'totp');
  assert.equal(uri.searchParams.get('secret'), secret);
  assert.equal(uri.searchParams.get('issuer'), 'KRABAK');
  assert.equal(uri.pathname, '/KRABAK%3Atest%40example.edu');
  assert.equal(createTotpCode(secret).length, 6);
});

test('recovery codes are high entropy and stored as deterministic hashes, not plaintext', () => {
  const codes = createRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[A-Z0-9]{32}$/);
    assert.match(hashRecoveryCode(code), /^[a-f0-9]{64}$/);
    assert.notEqual(hashRecoveryCode(code), code);
  }
});

test('TOTP secrets encrypt at rest and decrypt only with matching account context', () => {
  const secret = createTotpSecret();
  const encrypted = encryptTotpSecret(secret, 'admin@example.edu');
  assert.notEqual(JSON.stringify(encrypted).includes(secret), true);
  assert.equal(decryptTotpSecret(encrypted, 'admin@example.edu'), secret);
  assert.throws(() => decryptTotpSecret(encrypted, 'other@example.edu'));
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dataDir, 'mfa.key')).mode & 0o777, 0o600);
});

test('TOTP validation rejects malformed codes without throwing', () => {
  assert.equal(verifyTotp(createTotpSecret(), '12345', Date.now()), false);
  assert.equal(verifyTotp('bad!', '123456', Date.now()), false);
});

test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});
