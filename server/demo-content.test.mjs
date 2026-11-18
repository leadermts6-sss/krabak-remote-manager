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
