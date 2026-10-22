import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const digest = text => createHash('sha256').update(text.replaceAll('\r\n', '\n'), 'utf8').digest('hex');
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const httpOperation = value => value.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');

export async function checkCatalog(directory, openapiBytes) {
  const root = await realpath(directory);
  async function owned(path) {
    requireValue(typeof path === 'string' && !isAbsolute(path), 'Invalid repository path');
    const candidate = resolve(root, path), local = relative(root, candidate);
    requireValue(local && local !== '..' && !local.startsWith('..' + sep) && !isAbsolute(local), 'Escaping repository path');
    const actual = await realpath(candidate), actualLocal = relative(root, actual);
    requireValue(actualLocal && actualLocal !== '..' && !actualLocal.startsWith('..' + sep) && !isAbsolute(actualLocal), 'Escaping repository link');
    return actual;
  }
  const catalog = JSON.parse(decode(await readFile(await owned('index.json'))));
  const contractText = decode(await readFile(await owned('contracts.json')));
  const contracts = JSON.parse(contractText);
  requireValue(catalog.contracts_sha256 === digest(contractText), 'Contract inventory integrity mismatch');
  requireValue(catalog.version === '1.1.0' && Array.isArray(catalog.skills) && catalog.skills.length === 10, 'Unexpected catalog cohort');
  requireValue(contracts.format_version === 1 && Array.isArray(contracts.operations), 'Missing pinned HTTP contract');
  requireValue(/^[a-f0-9]{40}$/.test(contracts.source.commit) && /^[a-f0-9]{64}$/.test(contracts.source.sha256), 'Invalid contract provenance');
  if (openapiBytes !== undefined) {
    requireValue(createHash('sha256').update(openapiBytes).digest('hex') === contracts.source.sha256, 'OpenAPI source integrity mismatch');
    const openapi = JSON.parse(decode(openapiBytes));
    for (const operation of contracts.operations) {
      const path = operation.sourcePath ?? operation.path;
      requireValue(openapi.paths[path]?.[operation.method.toLowerCase()]?.operationId === operation.operationId, 'Operation differs from pinned OpenAPI');
      const bound = path.replace(/\{([^}]+)\}/g, (match, name) => Object.hasOwn(operation.literalParameters ?? {}, name)
        ? encodeURIComponent(operation.literalParameters[name]) : match);
      requireValue(bound === operation.path, 'Invalid literal operation binding');
    }
  }
  const operations = new Set(contracts.operations.map(item => item.method + ' /v1' + item.path));
  const ids = new Set();
  let snippets = 0, links = 0;
  for (const entry of catalog.skills) {
    requireValue(/^[a-z][a-z0-9-]*$/.test(entry.id) && !ids.has(entry.id), 'Duplicate or invalid skill ID');
    ids.add(entry.id);
    requireValue(entry.path === `${entry.id}/skill.md`, 'Unexpected skill path');
    const text = decode(await readFile(await owned(entry.path)));
    requireValue(entry.sha256 === digest(text), `Content integrity mismatch: ${entry.id}`);
    requireValue(entry.qualification === 'source-reviewed', `Missing qualification boundary: ${entry.id}`);
    requireValue(text.startsWith('# Skill: ') && /## When to [Uu]se/.test(text), `Missing task trigger: ${entry.id}`);
    requireValue(!text.includes('CLI_SOURCE_COMMIT'), 'Unbound CLI source');
    for (const operation of entry.apis ?? []) requireValue(operations.has(httpOperation(operation)), `Unknown public HTTP operation: ${operation}`);
    for (const match of text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)) {
      snippets++;
      if (match[1].trim() === 'json') JSON.parse(match[2]);
      if (match[1].trim() === 'javascript') {
        const parsed = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: match[2], encoding: 'utf8', timeout: 5000 });
        requireValue(parsed.status === 0, `Invalid JavaScript example: ${entry.id}`);
      }
      requireValue(!/@bota\.dev\/node|startStreamingSync|"chunk_index"|\/v1\/projects\/config\/processing/.test(match[2]), `Obsolete executable example: ${entry.id}`);
      requireValue(!/\/v1\/webhooks/.test(match[2]), `Unavailable public webhook CRUD: ${entry.id}`);
    }
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (target.startsWith('https://')) {
        const url = new URL(target);
        if (url.hostname.replace(/\.$/, '') === 'github.com' && /^\/bota-dev\/[^/]+\/(?:blob|tree)\//i.test(url.pathname)) requireValue(/\/(?:blob|tree)\/[a-f0-9]{40}(?:\/|$)/.test(url.pathname), 'Floating source reference');
        continue;
      }
      if (target.startsWith('#')) continue;
      const path = target.split('#')[0];
      requireValue(!/^[a-z]+:/i.test(path), 'Unsupported link scheme');
      await owned(relative(root, resolve(root, dirname(entry.path), path))); links++;
    }
  }
  requireValue(new Set(contracts.operations.map(item => item.operationId)).size === contracts.operations.length, 'Duplicate pinned operation ID');
  return { skills: ids.size, snippets, localLinks: links, httpOperations: operations.size, qualification: 'source-reviewed', liveAcceptance: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  requireValue(process.argv.length === 2 || process.argv.length === 4 && process.argv[2] === '--openapi', 'Usage: check-catalog.mjs [--openapi pinned-source.json]');
  console.log(JSON.stringify(await checkCatalog(resolve(dirname(fileURLToPath(import.meta.url)), '..'), process.argv.length === 4 ? await readFile(process.argv[3]) : undefined)));
}
