import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// TikTok proves ownership of studio.vayora.id with a signature file served from the site root: tiktok<signature>.txt whose
// single line is tiktok-developers-site-verification=<signature>. It lives in public/, so Next serves it as plain text.
test('the TikTok URL-prefix verification file is in public/ and names its own signature', () => {
  const dir = path.resolve(import.meta.dirname, '../public');
  const files = readdirSync(dir).filter(name => /^tiktok[A-Za-z0-9]{16,}\.txt$/.test(name));
  assert.equal(files.length, 1, 'exactly one signature file');
  const signature = files[0].slice('tiktok'.length, -'.txt'.length);
  assert.equal(readFileSync(path.join(dir, files[0]), 'utf8').trim(), `tiktok-developers-site-verification=${signature}`);
});
