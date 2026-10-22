import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkCatalog, digest } from '../scripts/check-catalog.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('all ten guide bodies, local links, JSON examples and HTTP operations match their catalog cohort', async () => {
  const result = await checkCatalog(root);
  assert.equal(result.skills, 10); assert.equal(result.liveAcceptance, false);
  assert.ok(result.snippets > 0); assert.ok(result.localLinks >= 5);
});
for (const kind of ['modified-content', 'escaping-path', 'unknown-route', 'floating-source', 'mixed-case-floating-source', 'modified-contract', 'missing-guide']) {
  test(`catalog refuses ${kind} before declaring a supported cohort`, async t => {
    const target = await mkdtemp(join(tmpdir(), 'bota-skill-integrity-'));
    t.after(async () => {
      const local = relative(tmpdir(), target);
      assert.ok(local && local !== '..' && !local.startsWith('..') && !isAbsolute(local));
      await rm(target, { recursive: true, force: true });
    });
    await cp(root, target, { recursive: true, filter: path => !relative(root, path).split(/[\\/]/).some(item => ['.git', 'node_modules'].includes(item)) });
    const indexPath = join(target, 'index.json'), catalog = JSON.parse(await readFile(indexPath, 'utf8'));
    if (kind === 'modified-content') await writeFile(join(target, catalog.skills[0].path), '# Skill: silently changed\n');
    if (kind === 'escaping-path') catalog.skills[0].path = '../outside/skill.md';
    if (kind === 'unknown-route') catalog.skills[0].apis.push('POST /v1/webhooks');
    if (kind === 'floating-source' || kind === 'mixed-case-floating-source') {
      const guidePath = join(target, catalog.skills[0].path);
      let guide = (await readFile(guidePath, 'utf8')).replace(/\/(blob|tree)\/[a-f0-9]{40}\//, '/$1/main/');
      if (kind === 'mixed-case-floating-source') guide = guide.replace('https://github.com', 'https://GITHUB.com');
      assert.notEqual(guide, await readFile(guidePath, 'utf8'));
      await writeFile(guidePath, guide);
      catalog.skills[0].sha256 = digest(guide);
    }
    if (kind === 'modified-contract') {
      const path = join(target, 'contracts.json'), contract = JSON.parse(await readFile(path, 'utf8'));
      contract.operations[0].operationId = 'inventedOperation';
      await writeFile(path, JSON.stringify(contract));
    }
    if (kind === 'missing-guide') catalog.skills.pop();
    await writeFile(indexPath, JSON.stringify(catalog));
    await assert.rejects(checkCatalog(target));
  });
}
