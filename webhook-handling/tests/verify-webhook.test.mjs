import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyBotaWebhook } from '../examples/verify-webhook.mjs';

const secret = 'synthetic-webhook-fixture-secret', now = 1_792_627_200;
const body = Buffer.from('{"id":"evt_fixture","type":"transcription.completed","data":{"text":"客户"}}');
function sign(bytes = body, timestamp = String(now), key = secret) {
  return 'v1=' + createHmac('sha256', key).update(timestamp + '.').update(bytes).digest('hex');
}
const verify = (signature = sign(), timestamp = String(now), bytes = body, key = secret, clock = now) =>
  verifyBotaWebhook(bytes, signature, timestamp, key, clock);

test('accepts exact timestamp and original UTF8 body bytes', () => assert.equal(verify(), true));
test('accepts uppercase signature hex without changing its scheme', () => assert.equal(verify('v1=' + sign().slice(3).toUpperCase()), true));
test('includes timestamp in the MAC rather than signing only the body', () => {
  const legacy = 'v1=' + createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verify(legacy), false); assert.equal(verify(sign(), String(now + 1)), false);
});
test('refuses modified body bytes and parsed/reserialized JSON', () => {
  assert.equal(verify(sign(), String(now), Buffer.concat([body, Buffer.from('\n')])), false);
  assert.equal(verify(sign(), String(now), Buffer.from(JSON.stringify(JSON.parse(body), null, 2))), false);
});
test('refuses a different endpoint secret', () => assert.equal(verify(sign(), String(now), body, 'different-fixture-secret'), false));
test('accepts both exact 300-second freshness boundaries', () => {
  for (const timestamp of [now - 300, now + 300]) assert.equal(verify(sign(body, String(timestamp)), String(timestamp)), true);
});
test('refuses stale and future signatures beyond the freshness window', () => {
  for (const timestamp of [now - 301, now + 301]) assert.equal(verify(sign(body, String(timestamp)), String(timestamp)), false);
});
test('refuses missing, repeated, malformed and wrong-scheme signatures', () => {
  for (const signature of [null, [sign(), sign()], '', 'sha256=' + sign().slice(3), 'v2=' + sign().slice(3), 'v1=0', 'v1=' + 'g'.repeat(64), sign() + '\n', sign() + ', ' + sign()]) assert.equal(verify(signature), false);
  assert.equal(verifyBotaWebhook(body, undefined, String(now), secret, now), false);
});
test('refuses noncanonical or repeated timestamp headers', () => {
  for (const timestamp of [null, [String(now)], '', '0' + now, '-1', '1.5', '1e9', ' ' + now, String(now) + '\r\n', '9'.repeat(12)]) assert.equal(verify(sign(), timestamp), false);
  assert.equal(verifyBotaWebhook(body, sign(), undefined, secret, now), false);
});
test('refuses a missing or non-string environment secret', () => {
  for (const key of [null, '', 123]) assert.equal(verify(sign(), String(now), body, key), false);
  assert.equal(verifyBotaWebhook(body, sign(), String(now), undefined, now), false);
});
test('requires a raw Buffer rather than a parsed object or string', () => {
  for (const bytes of [null, body.toString(), JSON.parse(body), new Uint8Array(body)]) assert.equal(verify(sign(), String(now), bytes), false);
  assert.equal(verifyBotaWebhook(undefined, sign(), String(now), secret, now), false);
});
test('refuses an invalid trusted clock', () => {
  for (const clock of [-1, NaN, Infinity, now + 0.5, String(now)]) assert.equal(verify(sign(), String(now), body, secret, clock), false);
});
