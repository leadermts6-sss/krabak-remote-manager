import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword, verifyPassword, readAdmin } from './auth.mjs';

const ACTIVATION_TTL = 24 * 60 * 60 * 1000;
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function dataDir() {
  return path.resolve(process.env.KRABAK_DATA_DIR || path.join(process.cwd(), '.local-data'));
}

function usersFile() {
  return path.join(dataDir(), 'users.json');
}

function ensureDataDir() {
  fs.mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  fs.chmodSync(dataDir(), 0o700);
}

function readUsers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(usersFile(), 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('Teacher account store has an invalid format');
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function writeUsers(users) {
  ensureDataDir();
  const file = usersFile();
  const temporaryFile = path.join(dataDir(), '.users-' + process.pid + '-' + crypto.randomBytes(8).toString('hex') + '.tmp');
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryFile, 'wx', 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(users, null, 2) + '\n', 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryFile, file);
    fs.chmodSync(file, 0o600);
    try {
      const directoryDescriptor = fs.openSync(dataDir(), 'r');
      try { fs.fsyncSync(directoryDescriptor); } finally { fs.closeSync(directoryDescriptor); }
    } catch {
      // Some filesystems do not support syncing directory handles.
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporaryFile); } catch {}
    throw error;
  }
}

function normalizeEmail(email) {
  if (typeof email !== 'string') throw new Error('Invalid email');
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !emailPattern.test(normalized)) throw new Error('Invalid email');
  return normalized;
}

function activationDigest(code) {
  return crypto.createHash('sha256').update(code, 'utf8').digest();
}

function sameDigest(storedHex, suppliedCode) {
  if (typeof storedHex !== 'string' || typeof suppliedCode !== 'string') return false;
  try {
    const stored = Buffer.from(storedHex, 'hex');
    const supplied = activationDigest(suppliedCode);
    return stored.length === supplied.length && crypto.timingSafeEqual(stored, supplied);
  } catch {
    return false;
  }
}

function safeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: 'teacher',
    status: user.status,
    createdAt: user.createdAt,
    activatedAt: user.activatedAt || null,
    disabledAt: user.disabledAt || null,
    activationExpiresAt: user.activationExpiresAt || null,
  };
}

function makeActivation() {
  const activationCode = crypto.randomBytes(32).toString('base64url');
  return {
    activationCode,
    activationHash: activationDigest(activationCode).toString('hex'),
    expiresAt: new Date(Date.now() + ACTIVATION_TTL).toISOString(),
  };
}

export function validateTeacherPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return { ok: false, reason: 'length' };
  }
  if (!/^[A-Za-z0-9]+$/.test(password) || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, reason: 'letters-and-digits-required' };
  }
  return { ok: true };
}

export function createTeacher(email) {
  const normalizedEmail = normalizeEmail(email);
  const users = readUsers();
  const adminEmail = readAdmin()?.email?.trim().toLowerCase();
  if (adminEmail === normalizedEmail || users.some(user => user.email === normalizedEmail)) throw new Error('Account email already exists');

  const activation = makeActivation();
  const user = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    role: 'teacher',
    status: 'pending',
    createdAt: new Date().toISOString(),
    activatedAt: null,
    disabledAt: null,
    passwordSalt: null,
    passwordHash: null,
    activationHash: activation.activationHash,
    activationExpiresAt: activation.expiresAt,
  };
  users.push(user);
  writeUsers(users);
  return { user: safeUser(user), activationCode: activation.activationCode, expiresAt: activation.expiresAt };
}

export function activateTeacher(email, activationCode, password) {
  const normalizedEmail = normalizeEmail(email);
  const users = readUsers();
  const user = users.find(item => item.email === normalizedEmail && item.status === 'pending');
  const invalid = () => new Error('Invalid or expired activation code');
  if (!user || !sameDigest(user.activationHash, activationCode)) throw invalid();
  const expires = Date.parse(user.activationExpiresAt || '');
  if (!Number.isFinite(expires) || expires <= Date.now()) throw invalid();

  const policy = validateTeacherPassword(password);
  if (!policy.ok) throw new Error('Teacher password must be 12-128 ASCII letters and digits, including both');

  const passwordRecord = hashPassword(password);
  user.passwordSalt = passwordRecord.salt;
  user.passwordHash = passwordRecord.hash;
  user.status = 'active';
  user.activatedAt = new Date().toISOString();
  user.disabledAt = null;
  user.activationHash = null;
  user.activationExpiresAt = null;
  writeUsers(users);
  return safeUser(user);
}

export function listTeachers() {
  return readUsers().map(safeUser);
}

export function getTeacherForAuth(email) {
  let normalizedEmail;
  try { normalizedEmail = normalizeEmail(email); } catch { return null; }
  const user = readUsers().find(item => item.email === normalizedEmail && item.status === 'active');
  return user ? { ...user } : null;
}

export function verifyTeacherPassword(password, user) {
  return Boolean(user && user.status === 'active' && verifyPassword(password, {
    salt: user.passwordSalt,
    hash: user.passwordHash,
  }));
}

export function disableTeacher(userId) {
  const users = readUsers();
  const user = users.find(item => item.id === userId && item.role === 'teacher');
  if (!user || user.status === 'disabled') return false;
  user.status = 'disabled';
  user.disabledAt = new Date().toISOString();
  user.activationHash = null;
  user.activationExpiresAt = null;
  writeUsers(users);
  return true;
}

export function reissueActivation(userId) {
  const users = readUsers();
  const user = users.find(item => item.id === userId && item.role === 'teacher' && item.status === 'active');
  if (!user) throw new Error('Teacher account cannot be reissued');

  const activation = makeActivation();
  user.status = 'pending';
  user.activatedAt = null;
  user.passwordSalt = null;
  user.passwordHash = null;
  user.activationHash = activation.activationHash;
  user.activationExpiresAt = activation.expiresAt;
  writeUsers(users);
  return { activationCode: activation.activationCode, expiresAt: activation.expiresAt };
}
