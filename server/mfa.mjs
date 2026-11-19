import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_MS = 30_000;

function dataDirectory() {
  return path.resolve(process.env.KRABAK_DATA_DIR || path.join(process.cwd(), '.local-data'));
}

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(encoded) {
  if (typeof encoded !== 'string' || !/^[A-Z2-7]+$/i.test(encoded)) throw new Error('Invalid TOTP secret');
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of encoded.toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid TOTP secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function createTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function makeTotpUrl(secret, email) {
  const label = `KRABAK:${String(email).trim().toLowerCase()}`;
  const query = new URLSearchParams({ secret, issuer: 'KRABAK', algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${encodeURIComponent(label)}?${query}`;
}

function generateTotp(secret, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function createTotpCode(secret, at = Date.now()) {
  if (!Number.isFinite(at)) throw new Error('Invalid TOTP time');
  return generateTotp(secret, Math.floor(at / TOTP_STEP_MS));
}

export function matchTotpCounter(secret, code, at = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code) || !Number.isFinite(at)) return null;
  try {
    const counter = Math.floor(at / TOTP_STEP_MS);
    for (const offset of [0, -1, 1]) {
      if (counter + offset < 0) continue;
      const expected = Buffer.from(generateTotp(secret, counter + offset));
      const supplied = Buffer.from(code);
      if (expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied)) return counter + offset;
    }
    return null;
  } catch {
    return null;
  }
}

export function verifyTotp(secret, code, at = Date.now()) {
  return matchTotpCounter(secret, code, at) !== null;
}

export function createRecoveryCodes() {
  return Array.from({ length: 10 }, () => crypto.randomBytes(16).toString('hex').toUpperCase());
}

export function normalizeRecoveryCode(code) {
  return typeof code === 'string' ? code.replace(/[\s-]/g, '').toUpperCase() : '';
}

export function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code), 'utf8').digest('hex');
}

function dataKeyFile() {
  return path.join(dataDirectory(), 'mfa.key');
}

function loadOrCreateDataKey() {
  const directory = dataDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(directory, 0o700); } catch {}
  const file = dataKeyFile();
  try {
    const existing = fs.readFileSync(file);
    if (existing.length !== 32) throw new Error('Invalid MFA encryption key');
    try { fs.chmodSync(file, 0o600); } catch {}
    return existing;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const generated = crypto.randomBytes(32);
  try {
    fs.writeFileSync(file, generated, { flag: 'wx', mode: 0o600 });
    try { fs.chmodSync(file, 0o600); } catch {}
    return generated;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = fs.readFileSync(file);
    if (existing.length !== 32) throw new Error('Invalid MFA encryption key');
    return existing;
  }
}

export function encryptTotpSecret(secret, email) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadOrCreateDataKey(), iv);
  cipher.setAAD(Buffer.from(String(email).trim().toLowerCase(), 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { algorithm: 'A256GCM', iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') };
}

export function decryptTotpSecret(envelope, email) {
  if (envelope?.algorithm !== 'A256GCM' || !envelope.iv || !envelope.tag || !envelope.ciphertext) throw new Error('Invalid encrypted TOTP secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadOrCreateDataKey(), Buffer.from(envelope.iv, 'base64url'));
  decipher.setAAD(Buffer.from(String(email).trim().toLowerCase(), 'utf8'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
