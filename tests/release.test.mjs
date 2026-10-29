import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildRelease, packFiles, sha256, unpackFiles, verifyRelease } from '../scripts/build-release.mjs';
import { installRelease } from '../scripts/install-release.mjs';
import { publishRelease, readBoundedResponse, validateReleaseContext } from '../scripts/publish-release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceCommit = 'a'.repeat(40);
const release = await buildRelease(root, sourceCommit);
const archiveName = `bota-skills-${release.version}.tar.gz`;
const archive = release.artifacts.get(archiveName);
const manifestBytes = release.artifacts.get('release-manifest.json');
const checksums = release.artifacts.get('SHA256SUMS');
const env = {
  GITHUB_REPOSITORY: 'bota-dev/bota-skills', GITHUB_REPOSITORY_ID: '123',
  GITHUB_EVENT_NAME: 'push', GITHUB_REF: `refs/tags/v${release.version}`, GITHUB_SHA: sourceCommit,
  GITHUB_RUN_ATTEMPT: '1', CUSTOMER_SKILLS_RELEASE_APPROVAL: `${sourceCommit}:v${release.version}`,
  CUSTOMER_SKILLS_IMMUTABLE_RELEASES: 'enabled', GITHUB_TOKEN: 'synthetic-not-a-credential',
};
const context = validateReleaseContext(env, sourceCommit, release.version);

async function temporary(t) {
  const path = await mkdtemp(join(tmpdir(), 'bota-skills-release-'));
  t.after(async () => {
    const local = relative(tmpdir(), path);
    assert.ok(local && !local.startsWith('..') && !isAbsolute(local));
    await rm(path, { recursive: true, force: true });
  });
  return path;
}

test('repeat builds have identical archives, explicit source and separate release/catalog versions', async () => {
  const repeat = await buildRelease(root, sourceCommit);
  assert.deepEqual(repeat.artifacts, release.artifacts);
  const verified = verifyRelease(archive, manifestBytes, checksums, context);
  assert.match(verified.manifest.version, /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/);
  assert.notEqual(verified.manifest.version, verified.manifest.catalogSchemaVersion);
  assert.equal(verified.manifest.catalogSchemaVersion, '1.1.0');
  assert.equal(verified.manifest.liveAcceptance, false);
  assert.equal(verified.manifest.skills.length, 10);
  assert.match(verified.files.get('LICENSE').toString(), /MIT License\n\nCopyright \(c\) 2026 Bota/);
});

test('clean consumer installs all ten standard skills and executes the bundled webhook example', async t => {
  const target = join(await temporary(t), 'skills');
  const result = installRelease(archive, sha256(archive), target);
  assert.equal(result.skills, 10);
  assert.equal(result.liveAcceptance, false);
  assert.equal((await readdir(target)).length, 10);
  for (const skill of release.manifest.skills) {
    assert.match(await readFile(join(target, skill.name, 'SKILL.md'), 'utf8'), new RegExp(`^---\\nname: ${skill.name}\\n`));
    assert.equal(await readFile(join(target, skill.name, 'LICENSE'), 'utf8'), release.files.get('LICENSE').toString());
  }
  const { verifyBotaWebhook } = await import(pathToFileURL(join(target, 'bota-webhook-handling/examples/verify-webhook.mjs')).href);
  const raw = Buffer.from('{"event":"synthetic"}');
  const secret = 'synthetic-example-only';
  const signature = 'v1=' + createHmac('sha256', secret).update('1234.').update(raw).digest('hex');
  assert.equal(verifyBotaWebhook(raw, signature, '1234', secret, 1234), true);
  assert.equal(verifyBotaWebhook(Buffer.from('{}'), signature, '1234', secret, 1234), false);
});

test('digest mismatch refuses before any install writes, and occupied destinations remain unchanged', async t => {
  const parent = await temporary(t);
  const target = join(parent, 'skills');
  assert.throws(() => installRelease(archive, '0'.repeat(64), target), /SHA-256 mismatch/);
  assert.deepEqual(await readdir(parent), []);
  await mkdir(target);
  await writeFile(join(target, 'owner.txt'), 'preserve');
  assert.throws(() => installRelease(archive, sha256(archive), target), /EEXIST/);
  assert.deepEqual(await readdir(target), ['owner.txt']);
  assert.equal(await readFile(join(target, 'owner.txt'), 'utf8'), 'preserve');
});

test('source/version, content tampering, unknown files and traversal are refused', () => {
  assert.throws(() => verifyRelease(archive, manifestBytes, checksums, { sourceCommit: 'b'.repeat(40) }), /source mismatch/);
  assert.throws(() => verifyRelease(archive, manifestBytes, checksums, { version: '1.0.0' }), /version mismatch/);
  const tampered = unpackFiles(archive);
  const prefix = `bota-skills-${release.version}/`;
  tampered.set(prefix + 'skills/bota-cli/SKILL.md', Buffer.from('changed'));
  const changed = packFiles(tampered);
  const hashes = Buffer.from(`${sha256(changed)}  ${archiveName}\n${sha256(manifestBytes)}  release-manifest.json\n`);
  assert.throws(() => verifyRelease(changed, manifestBytes, hashes), /content does not match/);
  const extra = unpackFiles(archive);
  extra.set(prefix + 'unknown.txt', Buffer.from('unknown'));
  const unknown = packFiles(extra);
  assert.throws(() => verifyRelease(unknown, manifestBytes, Buffer.from(`${sha256(unknown)}  ${archiveName}\n${sha256(manifestBytes)}  release-manifest.json\n`)), /file set/);
  assert.throws(() => packFiles(new Map([['../escape', Buffer.from('no')]])), /archive path/);
  assert.throws(() => unpackFiles(archive.subarray(0, archive.length - 5)));
});

test('exact-source release authority refuses wrong repo/event/tag/approval/immutability and replay', () => {
  for (const change of [
    { GITHUB_REPOSITORY: 'bota-dev/claude-code-plugins' },
    { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_SHA: 'b'.repeat(40) }, { CUSTOMER_SKILLS_RELEASE_APPROVAL: `${'b'.repeat(40)}:v${release.version}` },
    { CUSTOMER_SKILLS_IMMUTABLE_RELEASES: '' }, { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_TOKEN: '' },
  ]) assert.throws(() => validateReleaseContext({ ...env, ...change }, sourceCommit, release.version));
});

test('streamed GitHub responses are bounded without Content-Length and cancel oversized bodies', async () => {
  assert.equal((await readBoundedResponse(new Response('bounded'), 32)).toString(), 'bounded');
  let cancelled = 0;
  const oversized = new Response(new ReadableStream({
    start(controller) { controller.enqueue(Buffer.alloc(16)); controller.enqueue(Buffer.alloc(17)); },
    cancel() { cancelled++; },
  }));
  await assert.rejects(readBoundedResponse(oversized, 32), /too large/);
  assert.equal(cancelled, 1);
  const advertised = new Response(Buffer.from('small'), { headers: { 'content-length': '999' } });
  await assert.rejects(readBoundedResponse(advertised, 32), /too large/);
});

function fakeGitHub(failure) {
  const calls = [], uploaded = [], bytes = new Map();
  let published = false;
  const remote = () => ({ id: 42, tag_name: context.tag, draft: !published, immutable: published && failure !== 'mutable', prerelease: true, assets: uploaded });
  const request = async (method, url, options = {}) => {
    calls.push({ method, url, publicRead: options.publicRead === true });
    const path = new URL(url).pathname;
    if (method === 'GET' && path === '/repos/bota-dev/bota-skills') return { id: 123, full_name: 'bota-dev/bota-skills', private: failure === 'private', visibility: failure === 'private' ? 'private' : 'public', archived: false };
    if (method === 'GET' && path.includes('/git/ref/tags/')) return { object: { type: 'commit', sha: failure === 'tag' ? 'b'.repeat(40) : sourceCommit } };
    if (method === 'GET' && path.includes('/compare/')) return { status: failure === 'unreviewed' ? 'diverged' : 'ahead', merge_base_commit: { sha: failure === 'unreviewed' ? 'b'.repeat(40) : sourceCommit } };
    if (method === 'GET' && path.includes('/releases/tags/')) return published || failure === 'occupied' ? remote() : null;
    if (method === 'GET' && path.endsWith('/releases')) {
      const page = Number(new URL(url).searchParams.get('page'));
      if (failure === 'draft') return [{ tag_name: context.tag, draft: true }];
      if (failure === 'later-draft') return page === 1 ? Array.from({ length: 100 }, (_, i) => ({ tag_name: `v0.0.${i}`, draft: false })) : [{ tag_name: context.tag, draft: true }];
      if (failure === 'incomplete-list') return Array.from({ length: 100 }, (_, i) => ({ tag_name: `v0.0.${i}`, draft: false }));
      return [];
    }
    if (method === 'POST' && path.endsWith('/releases')) {
      if (failure === 'unknown') throw new Error('write outcome unknown');
      return remote();
    }
    if (method === 'POST' && path.endsWith('/assets')) {
      const name = new URL(url).searchParams.get('name');
      const id = uploaded.length + 1;
      const body = options.body;
      uploaded.push({ id, name, state: 'uploaded', size: body.length, digest: `sha256:${sha256(body)}` });
      bytes.set(id, body);
      return uploaded.at(-1);
    }
    if (method === 'GET' && path.endsWith('/releases/42')) return remote();
    if (method === 'GET' && path.includes('/releases/assets/')) {
      if (failure === 'readback' || failure === 'public-readback' && options.publicRead) return Buffer.from('corrupt');
      return bytes.get(Number(path.split('/').at(-1)));
    }
    if (method === 'PATCH' && path.endsWith('/releases/42')) { published = true; return remote(); }
    throw new Error('Unexpected synthetic request');
  };
  return { request, calls };
}

test('publication stages once, checks uploaded bytes before publishing and reads all immutable assets anonymously', async () => {
  const fake = fakeGitHub();
  const result = await publishRelease(context, release, fake.request);
  assert.equal(result.immutable, true);
  assert.equal(result.archiveSha256, sha256(archive));
  assert.equal(result.liveAcceptance, false);
  assert.equal(fake.calls.filter(call => call.method === 'POST').length, 4);
  assert.equal(fake.calls.filter(call => call.method === 'PATCH').length, 1);
  const publishIndex = fake.calls.findIndex(call => call.method === 'PATCH');
  assert.equal(fake.calls.slice(0, publishIndex).filter(call => call.url.includes('/releases/assets/')).length, 3);
  assert.equal(fake.calls.filter(call => call.publicRead && call.url.includes('/releases/assets/')).length, 3);
});

for (const failure of ['private', 'tag', 'unreviewed', 'occupied', 'draft', 'later-draft', 'incomplete-list', 'readback', 'unknown', 'mutable', 'public-readback']) {
  test(`publication refuses ${failure} without replay or cleanup of partial outcomes`, async () => {
    const fake = fakeGitHub(failure);
    await assert.rejects(publishRelease(context, release, fake.request));
    assert.equal(fake.calls.filter(call => call.method === 'DELETE').length, 0);
    assert.ok(fake.calls.filter(call => call.method === 'POST' && call.url.endsWith('/releases')).length <= 1);
    if (['private', 'tag', 'unreviewed', 'occupied', 'draft', 'later-draft', 'incomplete-list'].includes(failure)) assert.equal(fake.calls.filter(call => call.method !== 'GET').length, 0);
    if (failure === 'readback') assert.equal(fake.calls.filter(call => call.method === 'PATCH').length, 0);
  });
}
