import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(projectRoot, 'server', 'index.mjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

test('rate limits distinguish clients forwarded by a trusted reverse proxy', {timeout: 15000}, async () => {
  const port = await availablePort();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'krabak-remote-rate-test-'));
  const child = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: {...process.env, HOST: '127.0.0.1', PORT: String(port), KRABAK_TRUST_PROXY: '1', KRABAK_DATA_DIR: dataDir},
    stdio: ['ignore', 'ignore', 'ignore']
  });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (child.exitCode !== null) throw new Error(`Backend exited before readiness (${child.exitCode})`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/status`);
        if (response.ok) { ready = true; break; }
      } catch {}
      await delay(50);
    }
    assert.equal(ready, true, 'backend should bind to the test loopback port');

    const statuses = [];
    for (let i = 1; i <= 8; i++) {
      const response = await fetch(`http://127.0.0.1:${port}/api/login`, {
        method: 'POST',
        headers: {'content-type': 'application/json', origin: `http://127.0.0.1:${port}`, 'x-real-ip': `198.51.100.${i}`},
        body: JSON.stringify({email: `probe${i}@example.invalid`})
      });
      statuses.push(response.status);
    }
    assert.deepEqual(statuses, Array(8).fill(401), 'distinct forwarded client IPs should not share one login rate-limit bucket');
  } finally {
    child.kill();
    await new Promise(resolve => child.once('close', resolve));
    await rm(dataDir, {recursive: true, force: true});
  }
});
