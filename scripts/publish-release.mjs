import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRelease, releaseVersion, sha256, verifyRelease } from './build-release.mjs';

const repository = 'bota-dev/bota-skills';
const base = `https://api.github.com/repos/${repository}`;
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };

export async function readBoundedResponse(response, maximumBytes = 2 * 1024 * 1024) {
  const length = response.headers.get('content-length');
  const reader = response.body?.getReader();
  requireThat(reader, 'GitHub response body is missing');
  const chunks = [];
  let size = 0;
  try {
    requireThat(length === null || /^\d+$/.test(length) && Number(length) < maximumBytes, 'GitHub response too large');
    while (true) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      requireThat(size < maximumBytes, 'GitHub response too large');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

export function validateReleaseContext(env, sourceCommit, version) {
  const tag = `v${version}`;
  requireThat(env.GITHUB_REPOSITORY === repository && /^[1-9]\d*$/.test(env.GITHUB_REPOSITORY_ID ?? ''), 'Release is restricted to the customer skills repository');
  requireThat(env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === `refs/tags/${tag}` && /^[a-f0-9]{40}$/.test(sourceCommit) && env.GITHUB_SHA === sourceCommit, 'Release event, source and version tag must agree');
  requireThat(env.GITHUB_RUN_ATTEMPT === '1', 'Do not replay a release attempt; inspect any prior or unknown outcome');
  requireThat(env.CUSTOMER_SKILLS_RELEASE_APPROVAL === `${sourceCommit}:${tag}`, 'Owner approval must match the exact source and release version');
  requireThat(env.CUSTOMER_SKILLS_IMMUTABLE_RELEASES === 'enabled', 'Owner must enable GitHub immutable releases before publication');
  requireThat(typeof env.GITHUB_TOKEN === 'string' && env.GITHUB_TOKEN.length > 0, 'The workflow GitHub token is required');
  return { sourceCommit, version, tag, repositoryId: Number(env.GITHUB_REPOSITORY_ID) };
}

// Fixed GitHub origins only. No API URL override, credential-bearing redirect,
// write retries, clobber, adoption, cleanup of partial writes or token logging.
export function githubTransport(token) {
  return async function request(method, url, { body, allowMissing = false, binary = false, publicRead = false } = {}) {
    const target = new URL(url);
    requireThat(target.protocol === 'https:' && !target.username && !target.password && ['api.github.com', 'uploads.github.com'].includes(target.hostname), 'Unexpected GitHub request origin');
    const headers = { Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'bota-customer-skills-release' };
    if (!publicRead) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json';
    let response;
    const deadline = AbortSignal.timeout(30000);
    try {
      response = await fetch(target, { method, headers, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body), redirect: 'manual', signal: deadline });
    } catch {
      throw new Error(method === 'GET' ? 'GitHub read failed' : 'GitHub write outcome unknown; inspect the release before any further action');
    }
    if (allowMissing && response.status === 404) return null;
    if (binary && [301, 302, 307, 308].includes(response.status)) {
      const location = new URL(response.headers.get('location'));
      requireThat(location.protocol === 'https:' && !location.username && !location.password && ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(location.hostname), 'Unexpected asset download redirect');
      response = await fetch(location, { redirect: 'error', signal: deadline }); // Never forward the token.
    }
    requireThat(response.ok, `GitHub ${method} failed (${response.status}); inspect any partial release instead of replaying`);
    const bytes = await readBoundedResponse(response);
    return binary ? bytes : JSON.parse(bytes.toString('utf8'));
  };
}

async function assertNoExistingRelease(request, tag) {
  // Tag lookup can omit drafts. A push-capable token's List releases response
  // includes them; require a complete bounded listing before the first write.
  requireThat(await request('GET', `${base}/releases/tags/${tag}`, { allowMissing: true }) === null, 'Release version is occupied; do not overwrite or adopt');
  for (let page = 1; page <= 20; page++) {
    const releases = await request('GET', `${base}/releases?per_page=100&page=${page}`);
    requireThat(Array.isArray(releases) && releases.length <= 100 && releases.every(release => typeof release.tag_name === 'string'), 'Invalid release inventory');
    requireThat(!releases.some(release => release.tag_name === tag), 'Release version is occupied by a draft or published release; do not overwrite or adopt');
    if (releases.length < 100) return;
  }
  throw new Error('Release inventory exceeds bounded review limit; no publication attempted');
}

async function verifyRemoteSource(request, context) {
  const ref = await request('GET', `${base}/git/ref/tags/${context.tag}`);
  let object = ref.object;
  for (let count = 0; object?.type === 'tag' && count < 5; count++) {
    requireThat(/^[a-f0-9]{40}$/.test(object.sha), 'Invalid annotated tag identity');
    object = (await request('GET', `${base}/git/tags/${object.sha}`)).object;
  }
  requireThat(object?.type === 'commit' && object.sha === context.sourceCommit, 'Remote tag does not match approved checkout');
  const main = await request('GET', `${base}/compare/${context.sourceCommit}...main`);
  requireThat(main.merge_base_commit?.sha === context.sourceCommit && ['identical', 'ahead'].includes(main.status), 'Release source must belong to reviewed main');
}

function verifyAssets(remote, artifacts) {
  requireThat(Array.isArray(remote.assets) && remote.assets.length === artifacts.size, 'Published asset inventory mismatch');
  const names = new Set();
  for (const asset of remote.assets) {
    const bytes = artifacts.get(asset.name);
    requireThat(bytes && !names.has(asset.name) && Number.isSafeInteger(asset.id) && asset.id > 0 && asset.state === 'uploaded' && asset.size === bytes.length && asset.digest === `sha256:${sha256(bytes)}`, 'Published asset identity mismatch');
    names.add(asset.name);
  }
}

export async function publishRelease(context, release, request) {
  requireThat(context.version === release.version && context.sourceCommit === release.manifest.sourceCommit, 'Release artifact identity mismatch');
  const archiveName = `bota-skills-${release.version}.tar.gz`;
  verifyRelease(release.artifacts.get(archiveName), release.artifacts.get('release-manifest.json'), release.artifacts.get('SHA256SUMS'), context);
  const repo = await request('GET', base);
  requireThat(repo.id === context.repositoryId && repo.full_name === repository && repo.private === false && repo.visibility === 'public' && repo.archived === false, 'Customer release requires the intended public repository');
  await verifyRemoteSource(request, context);
  await assertNoExistingRelease(request, context.tag);
  const draft = await request('POST', `${base}/releases`, { body: {
    tag_name: context.tag, target_commitish: context.sourceCommit, name: context.tag,
    draft: true, prerelease: context.version.includes('-'), make_latest: 'false',
    body: `Customer integration skills under MIT.\n\nSource: ${context.sourceCommit}\nCatalog schema: ${release.manifest.catalogSchemaVersion}\nCatalog SHA-256: ${release.manifest.catalogSha256}\nContract SHA-256: ${release.manifest.contractsSha256}\n\nSource-reviewed recipes and synthetic consumer checks; live Platform/CLI/MCP/device acceptance is separate. Install only after checking the archive SHA-256 in SHA256SUMS.`,
  } });
  requireThat(Number.isSafeInteger(draft.id) && draft.id > 0 && draft.tag_name === context.tag && draft.draft === true, 'Unexpected draft response; inspect the partial release');
  for (const [name, bytes] of release.artifacts) {
    await request('POST', `https://uploads.github.com/repos/${repository}/releases/${draft.id}/assets?name=${encodeURIComponent(name)}`, { body: bytes });
  }
  const staged = await request('GET', `${base}/releases/${draft.id}`);
  requireThat(staged.tag_name === context.tag && staged.draft === true, 'Draft changed during publication');
  verifyAssets(staged, release.artifacts);
  // Read back all uploaded bytes before the irreversible publish/lock boundary.
  for (const asset of staged.assets) {
    const bytes = await request('GET', `${base}/releases/assets/${asset.id}`, { binary: true });
    requireThat(bytes.equals(release.artifacts.get(asset.name)), 'Uploaded asset readback mismatch');
  }
  await verifyRemoteSource(request, context);
  await request('PATCH', `${base}/releases/${draft.id}`, { body: { draft: false } });
  const published = await request('GET', `${base}/releases/tags/${context.tag}`, { publicRead: true });
  requireThat(published.id === draft.id && published.tag_name === context.tag && published.draft === false && published.immutable === true && published.prerelease === context.version.includes('-'), 'Published immutable release is unverified; inspect before taking any further action');
  verifyAssets(published, release.artifacts);
  const downloaded = new Map();
  for (const asset of published.assets) {
    const bytes = await request('GET', `${base}/releases/assets/${asset.id}`, { binary: true, publicRead: true });
    requireThat(bytes.equals(release.artifacts.get(asset.name)), 'Public asset readback mismatch');
    downloaded.set(asset.name, bytes);
  }
  verifyRelease(downloaded.get(archiveName), downloaded.get('release-manifest.json'), downloaded.get('SHA256SUMS'), context);
  await verifyRemoteSource(request, context);
  return { version: context.version, sourceCommit: context.sourceCommit, immutable: true, assets: 3, archiveSha256: sha256(downloaded.get(archiveName)), liveAcceptance: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  requireThat(!execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim(), 'Publication requires a clean checkout');
  const context = validateReleaseContext(process.env, source, releaseVersion(root));
  console.log(JSON.stringify(await publishRelease(context, await buildRelease(root, source), githubTransport(process.env.GITHUB_TOKEN))));
}
