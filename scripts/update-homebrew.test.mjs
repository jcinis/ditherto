import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareVersions, formulaVersion, renderFormula, stableVersion, verifyArchive } from './update-homebrew.mjs';

test('only stable numeric versions are accepted', () => {
  for (const version of ['0.2.0-beta.1', '01.2.3', '1.2.3\n', '$(command)', undefined]) {
    assert.throws(() => stableVersion(version));
  }
  assert.equal(compareVersions('0.10.0', '0.2.0'), 1);
  assert.equal(compareVersions('0.1.9', '0.2.0'), -1);
  assert.equal(compareVersions('0.2.0', '0.2.0'), 0);
});

test('archive verification binds the version, registry URL and content checksum', () => {
  const bytes = Buffer.from('a published archive');
  const metadata = { name: 'ditherto', version: '0.2.0', dist: {
    tarball: 'https://registry.npmjs.org/ditherto/-/ditherto-0.2.0.tgz',
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  } };
  assert.equal(verifyArchive(metadata, bytes, '0.2.0'), createHash('sha256').update(bytes).digest('hex'));
  assert.throws(() => verifyArchive(metadata, Buffer.from('tampered'), '0.2.0'));
  assert.throws(() => verifyArchive(metadata, bytes, '0.3.0'));
  assert.throws(() => verifyArchive({ ...metadata, name: 'another-package' }, bytes, '0.2.0'));
  assert.throws(() => verifyArchive({ ...metadata, dist: { ...metadata.dist, tarball: 'https://example.com/package.tgz' } }, bytes, '0.2.0'));
});

test('the real template includes the verified checksum and tested native dependency', async () => {
  const template = await readFile(new URL('../packaging/homebrew/ditherto.rb.in', import.meta.url), 'utf8');
  const formula = renderFormula(template, '0.2.0', 'a'.repeat(64), '^0.1.74', '0.1.74');
  assert.equal(formulaVersion(formula), '0.2.0');
  assert.ok(formula.includes(`sha256 "${'a'.repeat(64)}"`));
  assert.ok(formula.includes(`'"@napi-rs/canvas": "0.1.74"'`));
  assert.ok(!/@[A-Z0-9_]+@/.test(formula));
  assert.throws(() => renderFormula(template, '0.2.0', 'bad-checksum', '^0.1.74', '0.1.74'));
});

test('tap synchronization upgrades, retries cleanly, and refuses to downgrade', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ditherto-tap-test-'));
  try {
    const template = await readFile(new URL('../packaging/homebrew/ditherto.rb.in', import.meta.url), 'utf8');
    const formula = version => renderFormula(template, version, 'a'.repeat(64), '^0.1.74', '0.1.74');
    const candidate = join(dir, 'candidate.rb');
    const target = join(dir, 'ditherto.rb');
    const sync = () => execFileSync(process.execPath, [new URL('./sync-homebrew.mjs', import.meta.url).pathname, candidate, target]);
    await writeFile(candidate, formula('0.2.0'));
    sync();
    assert.equal(await readFile(target, 'utf8'), formula('0.2.0'));
    sync();
    assert.equal(await readFile(target, 'utf8'), formula('0.2.0'));
    await writeFile(candidate, formula('0.1.0'));
    sync();
    assert.equal(await readFile(target, 'utf8'), formula('0.2.0'));
    await writeFile(candidate, formula('0.10.0'));
    sync();
    assert.equal(await readFile(target, 'utf8'), formula('0.10.0'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
