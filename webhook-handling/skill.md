# Skill: Webhook Handling

## When to use

Use to receive, verify and durably dispatch Bota project events on your server.
Events can be delayed, duplicated, out of order or absent when persistence
fails. Fetch current authorized resource state when order matters. A webhook
alone is not an upload-verification or device-cleanup receipt.

## Configure the endpoint

Manage endpoints in **Bota Platform → project → Webhooks → Endpoints**.
Select documented events and store the signing secret in your server's secret
manager as `BOTA_WEBHOOK_SECRET`. Public `/v1/webhooks` CRUD is unavailable;
do not invent API/SDK management methods.

Local development uses an explicitly configured tunnel and Platform endpoint.
The [CLI `0.2.0-beta.0` cohort](../cli/skill.md) offers manual forwarding of
original raw bytes and signature headers; it neither registers endpoints nor
verifies for the receiver.
Tunnel creation/test delivery need user intent. Never paste secrets into a model.

## Verify before parsing

```text
X-Bota-Signature: v1=<64 hexadecimal characters>
X-Bota-Timestamp: <Unix seconds>
X-Bota-Event-Id: <event identifier>
Content-Type: application/json
```

HMAC-SHA256 signs `<timestamp>.<exact raw request body>` using the endpoint
secret. Reject missing/malformed headers and timestamps beyond 300 seconds from
the receiver clock. Compare equal-length decoded signatures in constant time.
Parsing/re-serializing JSON first changes the signed bytes.

The [Node verifier](examples/verify-webhook.mjs) uses only `node:crypto`, reads
no credentials at import and returns a boolean. Supply the secret from the
receiver environment:

```javascript
import { verifyBotaWebhook } from './examples/verify-webhook.mjs';

async function acceptWebhook(rawBody, headers) {
  const valid = verifyBotaWebhook(
    rawBody, headers['x-bota-signature'], headers['x-bota-timestamp'],
    process.env.BOTA_WEBHOOK_SECRET,
  );
  if (!valid) return { status: 401 };
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch { return { status: 400 }; }
  if (!event || typeof event.id !== 'string' || !event.id ||
      typeof event.type !== 'string' || event.id !== headers['x-bota-event-id']) {
    return { status: 400 };
  }
  await persistOrEnqueueOnce(event.id, event);
  return { status: 204 };
}
```

`persistOrEnqueueOnce` is your durable transaction/queue integration point,
not an SDK function. Deduplicate and persist work before acknowledging; return
non-2xx on durable-acceptance failure without logging signed headers, secrets or
customer payloads. Acknowledging first can lose events on process failure.
Use a bounded raw-body reader before JSON middleware and enforce your receiver's
size/deadline policy. The verifier does not implement that server or queue.

## Dispatch the real envelope

Events use `{id, type, created_at, data}`; resource payloads are nested as
`data.recording`, `data.transcription` or `data.summary`. Consult the
[event reference](https://docs.bota.dev/webhooks/events) for each shape, rather
than inventing a flat `event` envelope or undocumented device-health events.

Deduplicate by stable event `id`/`X-Bota-Event-Id`, not a per-attempt delivery
header. Make the business effect idempotent with a durable claim; separate
`set` then process calls are not atomic exactly-once handling. Do not assume
arrival order or automatically create/retry paid jobs from a failure event.

Delivery uses a 10-second timeout. Persisted events have up to six attempts
through a periodic scan: next attempt can be immediately eligible, followed by
1 minute, 5 minutes, 30 minutes and 2 hours after the preceding failure. Queue-scan
latency adds delay. Leased-attempt source and live deployment qualification
remain separate; delivery is not guaranteed real time.

## Verification and references

Run synthetic tests without dependencies or Bota credentials:

```bash
node --test webhook-handling/tests/verify-webhook.test.mjs
```

This proves signature/timestamp handling, not your raw-body reader, durable
queue, tunnel or live delivery.

- [Pinned signature headers](https://github.com/bota-dev/bota/blob/2c388b098d4e0d8a4d3893018fed47a870305795/api/src/webhooks/signature.ts)
- [Pinned signing algorithm](https://github.com/bota-dev/bota/blob/2c388b098d4e0d8a4d3893018fed47a870305795/api/src/utils/crypto.ts)
- [Pinned retry repository](https://github.com/bota-dev/bota/blob/2c388b098d4e0d8a4d3893018fed47a870305795/api/src/repositories/webhook.repository.ts)
- [Receiver/signatures](https://docs.bota.dev/webhooks/overview), [events](https://docs.bota.dev/webhooks/events)
