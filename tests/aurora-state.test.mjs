/**
 * Tests for AuroraState (.aurora format v2) — canonical JSON, checksum,
 * v1 compatibility, tamper detection.
 * Run via `npm test` (plain node asserts, same harness as core tests).
 */
import assert from 'node:assert/strict';
import { canonicalJSON, sha256Hex, buildStateDocument, verifyStateDocument } from '../dist-test/AuroraState.js';

const results = { pass: 0, fail: 0, errors: [] };
const test = (name, fn) => {
  try {
    fn();
    results.pass++;
  } catch (e) {
    results.fail++;
    results.errors.push(`${name}: ${e.message}`);
  }
};
const testAsync = async (name, fn) => {
  try {
    await fn();
    results.pass++;
  } catch (e) {
    results.fail++;
    results.errors.push(`${name}: ${e.message}`);
  }
};

// ── canonicalJSON ──
test('canonicalJSON sorts keys deterministically', () => {
  const a = canonicalJSON({ b: 1, a: { d: 2, c: 3 } });
  const b = canonicalJSON({ a: { c: 3, d: 2 }, b: 1 });
  assert.equal(a, b);
  assert.ok(a.indexOf('"a"') < a.indexOf('"b"'));
});

test('canonicalJSON drops undefined values', () => {
  const j = canonicalJSON({ a: 1, b: undefined });
  assert.deepEqual(JSON.parse(j), { a: 1 });
});

// ── build + verify roundtrip (async) ──
const fsV1 = JSON.stringify({ '/': { kind: 'dir', children: { 'a.txt': { kind: 'file', content: 'hi', mtime: 1 } } } });

await testAsync('v2 roundtrip: build → verify ok, settings preserved', async () => {
  const doc = await buildStateDocument({ fsJson: fsV1, settings: { theme: 'ember', wallpaper: 'grid', sound: false, clock24: true } });
  const v = await verifyStateDocument(doc);
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.version, 2);
    assert.equal(v.settings.theme, 'ember');
    assert.deepEqual(v.fs['/'].children['a.txt'].content, 'hi');
  }
});

await testAsync('v2 checksum present and hex-tagged', async () => {
  const doc = await buildStateDocument({ fsJson: fsV1, settings: null });
  const parsed = JSON.parse(doc);
  assert.ok(parsed.checksum.startsWith('sha256:') || parsed.checksum.startsWith('fnv:'));
  assert.equal(parsed.version, 2);
  assert.equal(parsed.magic, 'AURORA-STATE');
});

await testAsync('v2 tamper detection: modified fs fails checksum', async () => {
  const doc = await buildStateDocument({ fsJson: fsV1, settings: null });
  const parsed = JSON.parse(doc);
  parsed.fs['/'].children['a.txt'].content = 'EVIL';
  const v = await verifyStateDocument(JSON.stringify(parsed));
  assert.equal(v.ok, false);
  if (!v.ok) assert.match(v.reason, /checksum mismatch/);
});

await testAsync('v1 files still import (no settings)', async () => {
  const v1 = JSON.stringify({ magic: 'AURORA-STATE', version: 1, exported: new Date().toISOString(), fs: JSON.parse(fsV1) });
  const v = await verifyStateDocument(v1);
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.version, 1);
    assert.equal(v.settings, null);
  }
});

await testAsync('garbage rejected with reason', async () => {
  assert.equal((await verifyStateDocument('not json')).ok, false);
  assert.equal((await verifyStateDocument('{"magic":"WRONG"}')).ok, false);
  const v = await verifyStateDocument('{"magic":"AURORA-STATE","version":9,"fs":{"/":{"kind":"dir"}}}');
  assert.equal(v.ok, false);
});

await testAsync('sha256Hex is deterministic and hex', async () => {
  const a = await sha256Hex('aurora');
  const b = await sha256Hex('aurora');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]+$/);
});

// report
console.log(`\nAURORA-STATE v2 tests: ${results.pass} passed, ${results.fail} failed`);
if (results.fail) {
  console.error(results.errors.join('\n'));
  process.exit(1);
}
