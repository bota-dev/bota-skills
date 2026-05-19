# Skill: Webhook Handling

## Purpose

Register a webhook endpoint with Bota and securely verify incoming event signatures so you can react to recording, transcription, and summary events in real time.

## When to Use

- Triggering downstream actions when a transcription or summary completes
- Syncing recording status to your database
- Sending notifications to end users when their recordings are ready
- Monitoring device health events (low battery, offline)

## Prerequisites

- A Bota secret key (`sk_live_*` or `sk_test_*`)
- A publicly accessible HTTPS URL for your webhook endpoint
- For local development: a tunnel tool (e.g. `ngrok http 3000`)

## Event Types

| Event | When It Fires |
|-------|--------------|
| `recording.created` | Recording record created |
| `recording.uploaded` | Audio file successfully uploaded to S3 |
| `transcription.completed` | Transcription finished — transcript available |
| `transcription.failed` | Transcription failed |
| `summary.completed` | Summary finished — summary available |
| `summary.failed` | Summary failed |
| `device.low_battery` | Device battery below threshold (Enterprise) |
| `device.offline` | Device hasn't sent a heartbeat in 24h (Enterprise) |

## How It Works

```
Bota → POST <your-endpoint>
  Headers:
    X-Bota-Signature: sha256=<hmac>
    X-Bota-Event: transcription.completed
    X-Bota-Delivery: <delivery-id>
  Body: { event, data, created_at }
```

Bota signs every request with HMAC-SHA256 using your webhook secret. Always verify the signature before processing.

## Implementation

### Step 1 — Register Your Webhook

```bash
curl -X POST https://api.bota.dev/v1/webhooks \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourapp.com/webhooks/bota",
    "events": [
      "transcription.completed",
      "summary.completed",
      "transcription.failed"
    ]
  }'
```

```json
{
  "id": "wh_01HGHI...",
  "url": "https://yourapp.com/webhooks/bota",
  "events": ["transcription.completed", "summary.completed", "transcription.failed"],
  "secret": "whsec_abc123...",
  "created_at": "2025-01-15T10:00:00Z"
}
```

**Save the `secret` immediately — it's shown only once.**

### Step 2 — Verify the Signature

**Node.js / TypeScript:**

```typescript
import crypto from "crypto";
import express from "express";

const app = express();

// IMPORTANT: Use raw body, not parsed JSON
app.post("/webhooks/bota", express.raw({ type: "application/json" }), (req, res) => {
  const signature = req.headers["x-bota-signature"] as string;
  const webhookSecret = process.env.BOTA_WEBHOOK_SECRET!;

  if (!verifySignature(req.body, signature, webhookSecret)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = JSON.parse(req.body.toString());

  // Respond fast — process async
  res.status(200).json({ received: true });

  handleEvent(event).catch(console.error);
});

function verifySignature(
  body: Buffer,
  signature: string,
  secret: string
): boolean {
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  // Constant-time comparison prevents timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

**Python (Flask):**

```python
import hmac
import hashlib
import json
from flask import Flask, request, abort

app = Flask(__name__)
WEBHOOK_SECRET = os.environ["BOTA_WEBHOOK_SECRET"]

@app.route("/webhooks/bota", methods=["POST"])
def bota_webhook():
    signature = request.headers.get("X-Bota-Signature", "")
    body = request.get_data()  # raw bytes

    expected = "sha256=" + hmac.new(
        WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(signature, expected):
        abort(401)

    event = json.loads(body)
    # Process async in production
    handle_event(event)
    return {"received": True}, 200
```

### Step 3 — Handle Events

```typescript
async function handleEvent(event: BotaEvent) {
  switch (event.event) {
    case "transcription.completed": {
      const { recording_id, transcription_id, end_user_id } = event.data;
      // Fetch full transcript if needed
      // Update your database
      // Notify end user
      break;
    }

    case "summary.completed": {
      const { recording_id, summary_id, end_user_id, template_id } = event.data;
      // Save summary to your CRM, EHR, etc.
      break;
    }

    case "transcription.failed": {
      const { recording_id, error } = event.data;
      // Alert your team, retry if appropriate
      break;
    }
  }
}
```

### Event Payload Shape

```json
{
  "event": "transcription.completed",
  "created_at": "2025-01-15T10:10:00Z",
  "data": {
    "transcription_id": "txn_01HJKL...",
    "recording_id": "rec_01HDEF...",
    "end_user_id": "eu_01HXYZ...",
    "device_id": "dev_01HABC...",
    "status": "completed",
    "duration_seconds": 3600,
    "language": "en"
  }
}
```

## Gotchas

**Use `express.raw()` or equivalent — not `express.json()`.** Signature verification runs on the raw bytes. If your framework parses the body first, the signature check will fail because whitespace and key ordering may differ.

**Respond 200 before processing.** Bota retries deliveries that don't receive a 2xx within 30 seconds. Acknowledge immediately, then process async.

**Use `timingSafeEqual` (or `hmac.compare_digest` in Python).** Regular string comparison (`===`) is vulnerable to timing attacks. Always use constant-time comparison.

**Bota retries failed deliveries** with exponential backoff: 5s, 30s, 5min, 30min, 2hr. Make your handler idempotent — you may receive the same event twice.

**Deduplicate on `X-Bota-Delivery`.** Each delivery attempt has a unique delivery ID in the header. Store processed delivery IDs to avoid double-processing:
```typescript
const deliveryId = req.headers["x-bota-delivery"] as string;
if (await redis.sismember("processed-deliveries", deliveryId)) return res.json({ received: true });
await redis.sadd("processed-deliveries", deliveryId);
// now process
```

**Webhook secret is shown only once.** Store it in your secrets manager immediately after registration. If lost, delete the webhook and create a new one.

## Reference

- [Webhooks Overview](https://docs.bota.dev/webhooks/overview) — setup, retry policy, best practices
- [Webhook Events](https://docs.bota.dev/webhooks/events) — all event types with full payload schemas
- [Register Webhook](https://docs.bota.dev/api-reference/webhooks/create)
- [Auto-Processing Skill](../auto-processing/skill.md) — trigger transcription/summary automatically
