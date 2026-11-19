import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forbiddenFixtures = [
  'demoDevices', 'KRABAK-OFFICE-01', 'KRABAK-TEACHER-02', 'KRABAK-LAB-03',
  'KRABAK-ADMIN-04', 'KRABAK-HOME-05', 'KRABAK-LIBRARY-06', 'KRABAK-MEDIA-07',
  'เปิดเซสชันจำลอง', 'ส่งไฟล์จำลอง', 'DEMO MODE', 'Interactive Demo',
];

async function sourceFiles() {
  return (await readdir(path.join(root, 'src')))
    .filter(name => name.endsWith('.js'))
    .map(name => path.join(root, 'src', name));
}

async function bundleFiles() {
  const assets = path.join(root, 'dist', 'assets');
  const names = await readdir(assets);
  return names.filter(name => name.endsWith('.js')).map(name => path.join(assets, name));
}

async function assertNoFixtures(files, label) {
  assert.ok(files.length, `${label} should include JavaScript files`);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const fixture of forbiddenFixtures) {
      assert.equal(source.includes(fixture), false, `${path.relative(root, file)} contains old demo fixture ${fixture}`);
    }
  }
}

test('frontend source no longer includes fictional devices or demo actions', async () => {
  await assertNoFixtures(await sourceFiles(), 'frontend source');
});

test('built production client no longer includes fictional devices or demo actions', async () => {
  await assertNoFixtures(await bundleFiles(), 'production bundle');
});

test('Windows Agent dashboard status reflects actual enrolled devices', async () => {
  const source = await readFile(path.join(root, 'src', 'main.js'), 'utf8');
  assert.match(source, /const agents = state\.devices\.filter\(host => host\.type === 'agent'\)/);
  assert.match(source, /const onlineAgents = agents\.filter\(host => host\.online\)\.length/);
  assert.match(source, /ยังไม่ได้ติดตั้ง Agent/);
  assert.match(source, /Agent ออฟไลน์/);
  assert.match(source, /Agent ออนไลน์/);
  assert.match(source, /เพิ่ม Windows Agent/);
  assert.match(source, /host\.trustedAccess[\s\S]{0,140}connect-device/, 'the list view must not offer direct control when trusted access is off');
  assert.match(source, /ทัชแพด/);
  assert.match(source, /ไม่ใช่การสัมผัส native/);
});
