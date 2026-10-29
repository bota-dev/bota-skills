import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { checkCatalog } from './check-catalog.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const maximumBytes = 2 * 1024 * 1024;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const text = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = entries => [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);

function sourceFile(directory, path) {
  const filename = resolve(directory, path);
  const realRoot = realpathSync(directory);
  const real = realpathSync(filename);
  const inside = relative(realRoot, real);
  requireThat(inside && !isAbsolute(inside) && !inside.split(sep).includes('..'), 'Source file escapes repository');
  // Reject links even when they currently resolve inside the tree.
  for (let at = filename; at !== resolve(directory); at = dirname(at)) {
    requireThat(!lstatSync(at).isSymbolicLink(), 'Source links are not releasable');
  }
  requireThat(lstatSync(filename).isFile(), 'Only regular files are releasable');
  return Buffer.from(text(readFileSync(filename)));
}

export function releaseVersion(directory = root) {
  const metadata = JSON.parse(sourceFile(directory, 'release.json'));
  requireThat(metadata.formatVersion === 1 && Object.keys(metadata).sort().join() === 'formatVersion,version', 'Unknown release metadata');
  requireThat(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:alpha|beta|rc)\.(0|[1-9]\d*))?$/.test(metadata.version), 'Invalid release version');
  return metadata.version;
}

// The release has a finite, dependency-free USTAR format: regular files only,
// ASCII paths, fixed ownership/mode/time, no extensions, links or directories.
export function packFiles(files) {
  const blocks = [];
  for (const [name, bytes] of sorted(files)) {
    requireThat(/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(name) && !name.split('/').includes('..') && Buffer.byteLength(name) < 100, 'Invalid archive path');
    requireThat(Buffer.isBuffer(bytes) && bytes.length < maximumBytes, 'Invalid archive file');
    const header = Buffer.alloc(512);
    header.write(name, 0);
    for (const [offset, width, value] of [[100, 8, 0o644], [108, 8, 0], [116, 8, 0], [124, 12, bytes.length], [136, 12, 0]]) {
      header.write(`${value.toString(8).padStart(width - 1, '0')}\0`, offset, width, 'ascii');
    }
    header.fill(32, 148, 156);
    header[156] = 48;
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    blocks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  const archive = gzipSync(Buffer.concat(blocks), { level: 9 });
  // gzip's OS byte varies across hosts; this is portable data, not a host archive.
  archive[9] = 255;
  requireThat(archive.length < maximumBytes, 'Bundle exceeds release size limit');
  return archive;
}

export function unpackFiles(archive) {
  requireThat(Buffer.isBuffer(archive) && archive.length < maximumBytes, 'Invalid bundle size');
  const tar = gunzipSync(archive, { maxOutputLength: maximumBytes });
  const files = new Map();
  let offset = 0;
  while (offset + 512 <= tar.length && tar.subarray(offset, offset + 512).some(byte => byte !== 0)) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('ascii').replace(/\0.*$/s, '');
    requireThat(/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(name) && !name.split('/').includes('..') && !files.has(name), 'Invalid or duplicate bundle path');
    requireThat(header[156] === 48 && header.subarray(257, 265).toString('ascii') === 'ustar\0' + '00', 'Only USTAR regular files are accepted');
    const checksum = Number.parseInt(header.subarray(148, 154).toString('ascii'), 8);
    const checked = Buffer.from(header); checked.fill(32, 148, 156);
    requireThat(checksum === checked.reduce((sum, byte) => sum + byte, 0), 'Invalid tar header checksum');
    const sizeText = header.subarray(124, 135).toString('ascii');
    requireThat(/^[0-7]{11}$/.test(sizeText), 'Invalid bundle file size');
    const size = Number.parseInt(sizeText, 8);
    const end = offset + 512 + size;
    requireThat(end <= tar.length, 'Truncated bundle');
    files.set(name, tar.subarray(offset + 512, end));
    offset = end + (512 - size % 512) % 512;
  }
  requireThat(files.size > 0 && tar.length === offset + 1024 && tar.subarray(offset).every(byte => byte === 0), 'Invalid bundle trailer');
  return files;
}

export async function buildRelease(directory, sourceCommit) {
  requireThat(/^[a-f0-9]{40}$/.test(sourceCommit), 'Release requires a full source commit');
  await checkCatalog(directory);
  const version = releaseVersion(directory);
  const catalogBytes = sourceFile(directory, 'index.json');
  const catalog = JSON.parse(catalogBytes);
  const files = new Map([
    ['LICENSE', sourceFile(directory, 'LICENSE')],
    ['README.md', Buffer.from(text(sourceFile(directory, 'README.md')).replace(/\]\(([a-z-]+)\/skill\.md\)/g, '](skills/bota-$1/SKILL.md)'))],
    ['source-index.json', catalogBytes],
    ['contracts.json', sourceFile(directory, 'contracts.json')],
  ]);
  const skills = [];
  for (const skill of catalog.skills) {
    const name = `bota-${skill.id}`;
    const body = text(sourceFile(directory, skill.path)).replace(/\.\.\/([a-z-]+)\/skill\.md/g, '../bota-$1/SKILL.md');
    const description = `Use when integrating Bota: ${skill.description}.`;
    requireThat(name.length <= 64 && description.length <= 1024, 'Skill metadata exceeds format limits');
    const frontmatter = `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\nlicense: MIT\nmetadata:\n  bota-version: ${JSON.stringify(version)}\n  bota-source: ${sourceCommit}\n---\n\n`;
    const path = `skills/${name}/SKILL.md`;
    files.set(path, Buffer.from(frontmatter + body));
    files.set(`skills/${name}/LICENSE`, sourceFile(directory, 'LICENSE'));
    skills.push({ name, path, sourcePath: skill.path, sourceSha256: skill.sha256 });
  }
  files.set('skills/bota-webhook-handling/examples/verify-webhook.mjs', sourceFile(directory, 'webhook-handling/examples/verify-webhook.mjs'));
  const manifest = {
    formatVersion: 1, version, sourceCommit,
    catalogSchemaVersion: catalog.version,
    catalogSha256: sha256(catalogBytes),
    contractsSha256: sha256(files.get('contracts.json')),
    generatorSha256: sha256(sourceFile(directory, 'scripts/build-release.mjs')),
    qualification: 'source-reviewed', liveAcceptance: false,
    skills,
    files: Object.fromEntries(sorted(files).map(([path, bytes]) => [path, sha256(bytes)])),
  };
  const manifestBytes = json(manifest);
  files.set('release-manifest.json', manifestBytes);
  const prefix = `bota-skills-${version}`;
  const archiveName = `${prefix}.tar.gz`;
  const archive = packFiles(new Map([...files].map(([path, bytes]) => [`${prefix}/${path}`, bytes])));
  const checksums = Buffer.from(`${sha256(archive)}  ${archiveName}\n${sha256(manifestBytes)}  release-manifest.json\n`);
  return { version, manifest, files, artifacts: new Map([[archiveName, archive], ['release-manifest.json', manifestBytes], ['SHA256SUMS', checksums]]) };
}

export function verifyRelease(archive, manifestBytes, checksums, { sourceCommit, version } = {}) {
  const manifest = JSON.parse(manifestBytes);
  requireThat(manifest.formatVersion === 1 && manifest.qualification === 'source-reviewed' && manifest.liveAcceptance === false, 'Unknown bundle qualification');
  requireThat(/^[a-f0-9]{40}$/.test(manifest.sourceCommit), 'Invalid source identity');
  requireThat(sourceCommit === undefined || sourceCommit === manifest.sourceCommit, 'Bundle source mismatch');
  requireThat(version === undefined || version === manifest.version, 'Bundle version mismatch');
  requireThat(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:alpha|beta|rc)\.(0|[1-9]\d*))?$/.test(manifest.version), 'Invalid bundle version');
  const prefix = `bota-skills-${manifest.version}`;
  requireThat(checksums.toString('utf8') === `${sha256(archive)}  ${prefix}.tar.gz\n${sha256(manifestBytes)}  release-manifest.json\n`, 'Release checksums do not match');
  const archived = unpackFiles(archive);
  requireThat(archived.size === Object.keys(manifest.files).length + 1, 'Unexpected bundle file set');
  const files = new Map();
  for (const [path, digest] of Object.entries(manifest.files)) {
    const bytes = archived.get(`${prefix}/${path}`);
    requireThat(bytes && sha256(bytes) === digest, 'Bundle content does not match manifest');
    files.set(path, bytes);
  }
  requireThat(archived.get(`${prefix}/release-manifest.json`)?.equals(manifestBytes), 'Bundled manifest mismatch');
  requireThat(sha256(files.get('source-index.json')) === manifest.catalogSha256 && sha256(files.get('contracts.json')) === manifest.contractsSha256, 'Contract/catalog mismatch');
  const catalog = JSON.parse(files.get('source-index.json'));
  requireThat(catalog.version === '1.1.0' && catalog.version === manifest.catalogSchemaVersion && catalog.contracts_sha256 === manifest.contractsSha256 && manifest.skills.length === 10 && catalog.skills.length === 10, 'Bundle skill inventory mismatch');
  requireThat(new Set(manifest.skills.map(skill => skill.name)).size === 10, 'Duplicate skill identity');
  const expectedPaths = ['LICENSE', 'README.md', 'source-index.json', 'contracts.json', 'skills/bota-webhook-handling/examples/verify-webhook.mjs', ...manifest.skills.flatMap(skill => [skill.path, `skills/${skill.name}/LICENSE`])].sort();
  requireThat(JSON.stringify([...files.keys()].sort()) === JSON.stringify(expectedPaths), 'Unknown installable bundle file');
  for (const skill of manifest.skills) {
    requireThat(files.get(`skills/${skill.name}/LICENSE`)?.equals(files.get('LICENSE')), 'Skill license is missing');
    const source = catalog.skills.find(entry => entry.path === skill.sourcePath);
    requireThat(source && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(source.id) && source.path === `${source.id}/skill.md` && source.sha256 === skill.sourceSha256 && skill.name === `bota-${source.id}` && skill.name.length <= 64 && skill.path === `skills/${skill.name}/SKILL.md`, 'Bundle skill identity mismatch');
    const body = files.get(skill.path)?.toString('utf8');
    const frontmatter = `---\nname: ${skill.name}\ndescription: ${JSON.stringify(`Use when integrating Bota: ${source.description}.`)}\nlicense: MIT\nmetadata:\n  bota-version: ${JSON.stringify(manifest.version)}\n  bota-source: ${manifest.sourceCommit}\n---\n\n`;
    requireThat(body?.startsWith(frontmatter), 'Invalid installable skill metadata');
    const restored = body.slice(frontmatter.length).replace(/\.\.\/bota-([a-z-]+)\/SKILL\.md/g, '../$1/skill.md');
    requireThat(sha256(Buffer.from(restored)) === source.sha256, 'Skill does not match reviewed source');
    for (const match of body.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/i.test(match[1])) continue;
      const target = relative('/bundle', resolve('/bundle', dirname(skill.path), match[1])).split(sep).join('/');
      requireThat(files.has(target), 'Installed skill link is missing');
    }
  }
  return { manifest, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  requireThat(args.length === 2 && args[0] === '--output', 'Usage: node scripts/build-release.mjs --output NEW_DIRECTORY');
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  requireThat(!execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim(), 'Release build requires a clean checkout');
  const release = await buildRelease(root, source);
  const [archiveName, archive] = release.artifacts.entries().next().value;
  verifyRelease(archive, release.artifacts.get('release-manifest.json'), release.artifacts.get('SHA256SUMS'), { sourceCommit: source, version: release.version });
  const output = resolve(args[1]);
  mkdirSync(output); // Never overwrite or adopt an occupied output.
  for (const [name, bytes] of release.artifacts) writeFileSync(join(output, name), bytes, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ version: release.version, sourceCommit: source, archive: archiveName, sha256: sha256(archive), skills: 10, liveAcceptance: false })}\n`);
}
