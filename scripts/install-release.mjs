import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256, unpackFiles, verifyRelease } from './build-release.mjs';

// No network, credentials, lifecycle hooks, shell execution or existing-directory
// adoption. The caller obtains the expected SHA-256 from a trusted release.
export function installRelease(archive, expectedSha256, destination) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256) || sha256(archive) !== expectedSha256) throw new Error('Archive SHA-256 mismatch');
  const archived = unpackFiles(archive);
  const manifestPaths = [...archived.keys()].filter(path => /^[^/]+\/release-manifest\.json$/.test(path));
  if (manifestPaths.length !== 1) throw new Error('Expected one release manifest');
  const manifestBytes = archived.get(manifestPaths[0]);
  const manifest = JSON.parse(manifestBytes);
  const checksums = Buffer.from(`${expectedSha256}  bota-skills-${manifest.version}.tar.gz\n${sha256(manifestBytes)}  release-manifest.json\n`);
  const verified = verifyRelease(archive, manifestBytes, checksums);
  const target = resolve(destination);
  for (let at = dirname(target); ; at = dirname(at)) {
    if (lstatSync(at).isSymbolicLink() || !lstatSync(at).isDirectory()) throw new Error('Installation parent must be an existing real directory');
    if (dirname(at) === at) break;
  }
  mkdirSync(target); // Occupied paths fail without changing their contents.
  for (const [path, bytes] of verified.files) {
    if (!path.startsWith('skills/')) continue;
    const output = join(target, path.slice('skills/'.length));
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, bytes, { flag: 'wx' });
  }
  return { version: manifest.version, sourceCommit: manifest.sourceCommit, skills: 10, destination: target, liveAcceptance: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== '--archive' || args[2] !== '--sha256' || args[4] !== '--destination') throw new Error('Usage: node scripts/install-release.mjs --archive BUNDLE --sha256 EXPECTED_SHA256 --destination NEW_SKILLS_DIRECTORY');
  console.log(JSON.stringify(installRelease(readFileSync(resolve(args[1])), args[3], args[5])));
}
