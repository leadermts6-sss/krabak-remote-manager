import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ENROLLMENT_TTL = 10 * 60_000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{40,50}$/;
const MAX_AGENT_FRAME_CHARS = 900_000;
const ALLOWED_KEYS = new Set([
  0x08, 0x09, 0x0d, 0x10, 0x11, 0x12, 0x1b, 0x20,
  0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e,
  ...Array.from({ length: 10 }, (_, index) => 0x30 + index),
  ...Array.from({ length: 26 }, (_, index) => 0x41 + index),
  ...Array.from({ length: 10 }, (_, index) => 0x60 + index),
  ...Array.from({ length: 12 }, (_, index) => 0x70 + index),
  0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5,
]);

const isCoordinate = value => Number.isInteger(value) && value >= 0 && value <= 65_535;

export function validateAgentInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (input.kind === 'move' && isCoordinate(input.x) && isCoordinate(input.y)) {
    return { kind: 'move', x: input.x, y: input.y };
  }
  if (input.kind === 'button' && ['left', 'right', 'middle'].includes(input.button)
    && typeof input.down === 'boolean' && isCoordinate(input.x) && isCoordinate(input.y)) {
    return { kind: 'button', button: input.button, down: input.down, x: input.x, y: input.y };
  }
  if (input.kind === 'wheel' && Number.isInteger(input.delta) && input.delta >= -1_200 && input.delta <= 1_200) {
    return { kind: 'wheel', delta: input.delta };
  }
  if (input.kind === 'key' && Number.isInteger(input.virtualKey) && ALLOWED_KEYS.has(input.virtualKey)
    && typeof input.down === 'boolean') {
    return { kind: 'key', virtualKey: input.virtualKey, down: input.down };
  }
  return null;
}

export function validateAgentFrame(frame, width, height) {
  if (typeof frame !== 'string' || frame.length < 8 || frame.length > MAX_AGENT_FRAME_CHARS) return false;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(frame)) return false;
  return Number.isInteger(width) && width >= 1 && width <= 3_840
    && Number.isInteger(height) && height >= 1 && height <= 2_160;
}

function digest(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function matchesDigest(hex, value) {
  if (typeof hex !== 'string' || typeof value !== 'string') return false;
  try {
    const saved = Buffer.from(hex, 'hex');
    const supplied = digest(value);
    return saved.length === supplied.length && crypto.timingSafeEqual(saved, supplied);
  } catch {
    return false;
  }
}

function safeAgent(agent) {
  const { tokenHash, ...publicRecord } = agent;
  return { ...publicRecord };
}

export function createAgentStore({ dataDir = path.resolve(process.env.KRABAK_DATA_DIR || path.join(process.cwd(), '.local-data')), now = Date.now } = {}) {
  const file = path.join(dataDir, 'agents.json');

  function readState() {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!value || !Array.isArray(value.enrollments) || !Array.isArray(value.agents)) {
        throw new Error('Agent registry has an invalid format');
      }
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return { enrollments: [], agents: [] };
      throw error;
    }
  }

  function writeState(state) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(dataDir, 0o700); } catch {}
    const temporaryFile = path.join(dataDir, '.agents-' + process.pid + '-' + crypto.randomBytes(8).toString('hex') + '.tmp');
    let descriptor;
    try {
      descriptor = fs.openSync(temporaryFile, 'wx', 0o600);
      fs.writeFileSync(descriptor, JSON.stringify(state, null, 2) + '\n', 'utf8');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporaryFile, file);
      fs.chmodSync(file, 0o600);
      try {
        const directoryDescriptor = fs.openSync(dataDir, 'r');
        try { fs.fsyncSync(directoryDescriptor); } finally { fs.closeSync(directoryDescriptor); }
      } catch {
        // Directory handles are not syncable on every supported filesystem.
      }
    } catch (error) {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      try { fs.unlinkSync(temporaryFile); } catch {}
      throw error;
    }
  }

  function createEnrollment(ownerEmail) {
    if (typeof ownerEmail !== 'string' || !EMAIL_RE.test(ownerEmail)) throw new Error('Invalid Agent owner');
    const code = crypto.randomBytes(32).toString('base64url');
    const createdAt = now();
    const state = readState();
    state.enrollments = state.enrollments.filter(item => item.expiresAt > createdAt);
    state.enrollments.push({ codeHash: digest(code).toString('hex'), ownerEmail: ownerEmail.toLowerCase(), expiresAt: createdAt + ENROLLMENT_TTL });
    writeState(state);
    return { code, expiresAt: new Date(createdAt + ENROLLMENT_TTL).toISOString() };
  }

  function activateEnrollment(code, name, trustedAccess) {
    if (typeof code !== 'string' || !TOKEN_RE.test(code) || typeof trustedAccess !== 'boolean') return null;
    const safeName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
    if (safeName.length < 2) return null;
    const state = readState();
    const current = now();
    const matchIndex = state.enrollments.findIndex(item => matchesDigest(item.codeHash, code) && item.expiresAt > current);
    if (matchIndex < 0) {
      const kept = state.enrollments.filter(item => item.expiresAt > current);
      if (kept.length !== state.enrollments.length) { state.enrollments = kept; writeState(state); }
      return null;
    }
    const [enrollment] = state.enrollments.splice(matchIndex, 1);
    const token = crypto.randomBytes(32).toString('base64url');
    const agent = {
      id: crypto.randomUUID(),
      ownerEmail: enrollment.ownerEmail,
      name: safeName,
      trustedAccess,
      createdAt: new Date(current).toISOString(),
      tokenHash: digest(token).toString('hex'),
    };
    state.agents.push(agent);
    writeState(state);
    return { device: safeAgent(agent), token };
  }

  function authenticate(token) {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
    const hash = digest(token).toString('hex');
    const agent = readState().agents.find(item => matchesDigest(item.tokenHash, token) && item.tokenHash === hash);
    return agent ? safeAgent(agent) : null;
  }

  function findById(id) {
    const agent = readState().agents.find(item => item.id === id);
    return agent ? safeAgent(agent) : null;
  }

  function list(requesterEmail, isAdmin = false) {
    const normalized = String(requesterEmail || '').toLowerCase();
    return readState().agents
      .filter(agent => isAdmin || agent.ownerEmail === normalized)
      .map(safeAgent);
  }

  function revoke(id, requesterEmail, isAdmin = false) {
    const state = readState();
    const index = state.agents.findIndex(agent => agent.id === id);
    if (index < 0) return false;
    const agent = state.agents[index];
    if (!isAdmin && agent.ownerEmail !== String(requesterEmail || '').toLowerCase()) return false;
    state.agents.splice(index, 1);
    writeState(state);
    return true;
  }

  function revokeOwner(ownerEmail) {
    const normalized = String(ownerEmail || '').toLowerCase();
    const state = readState();
    const previousLength = state.agents.length;
    state.agents = state.agents.filter(agent => agent.ownerEmail !== normalized);
    const previousEnrollments = state.enrollments.length;
    state.enrollments = state.enrollments.filter(enrollment => enrollment.ownerEmail !== normalized);
    if (state.agents.length !== previousLength || state.enrollments.length !== previousEnrollments) writeState(state);
    return previousLength - state.agents.length;
  }

  return { createEnrollment, activateEnrollment, authenticate, findById, list, revoke, revokeOwner };
}
