# Skill: Recording Upload

## When to use

Use for an ordinary **server-owned audio import**: create a recording, request
a destination, PUT the complete file, then obtain verified server completion.
Physical App SDK capture uses **encrypted-upload-v2** with exact capture
identity, ciphertext integrity, cloud verification, signed completion receipt
and receipt-gated device cleanup. This ordinary flow cannot qualify it.

Route device integrations to [encrypted-v2](https://docs.bota.dev/api-reference/uploads/encrypted-v2)
and the supported [App SDK](https://docs.bota.dev/api-reference/client-sdks).
Do not downgrade `v2_required` policy or modify retained device bytes/journals.

## Server workflow

1. Obtain application authorization to import the file. Supply the project
   key through server `BOTA_API_KEY`; restricted-key writes require
   `recordings:write`. Never give that key to mobile/browser code or a model.
2. Persist import intent and its resulting recording ID. Create with
   `source: "api_upload"`, `upload_method: "import"`, optional name/end-user
   mapping and `recorded_at`. Ordinary creation does not take
   `duration_seconds`. Do not manufacture device capture UUID/generation for
   an imported file.
3. Request `/recordings/{id}/upload-url` with actual `content_type` and optional
   `file_size_bytes`. Read `upload_url`, `upload_token`, `expires_in` and returned
   `content_type`; do not invent `expires_at` or assume a 15-minute lifetime.
4. PUT the complete unchanged bytes using the returned content type. Attach no
   project Authorization header to S3. Signed URLs/upload tokens are credentials;
   do not log them or paste them into prompts. Refuse redirects.
5. Only after PUT success, submit `/recordings/{id}/upload-complete` with exact
   byte count and lowercase full-file SHA-256. Optional duration is an integer
   in seconds. `200` confirms completion; `425 upload_verification_pending`
   retains the original source and exact evidence.
6. Retry only identical completion evidence with bounded backoff while
   verification is pending, or reconcile after ambiguous completion. Do not
   recreate the recording or replay create/PUT blindly. Investigate `409
   upload_integrity_failed`; an explicit repair can obtain a fresh destination
   and PUT the complete original file. Preserve source on failure.

`uploaded` is not processing completion. Auto-processing is a best-effort
subsequent attempt. A webhook alone is not a device-delete receipt.

## Server HTTP example

This helper assumes an existing, durably recorded import ID and a buffered
file under your application's memory limit. The caller owns file acquisition,
intent persistence, destination policy and reconciliation. Each step is
attempted once, with no automatic mutation retry.

```javascript
import { createHash } from 'node:crypto';

const api = 'https://api.bota.dev/v1';
const key = process.env.BOTA_API_KEY;
if (!key) throw new Error('BOTA_API_KEY is required');

async function post(path, body) {
  return fetch(api + path, {
    method: 'POST', redirect: 'error', credentials: 'omit',
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function uploadExistingImport(recordingId, bytes, contentType) {
  const path = `/recordings/${encodeURIComponent(recordingId)}`;
  const issued = await post(path + '/upload-url', {
    content_type: contentType, file_size_bytes: bytes.length,
  });
  if (!issued.ok) throw new Error(`Destination request failed (${issued.status})`);
  const destination = await issued.json();
  assertAllowedUploadDestination(destination.upload_url);
  const uploaded = await fetch(destination.upload_url, {
    method: 'PUT', redirect: 'error', credentials: 'omit',
    signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': destination.content_type }, body: bytes,
  });
  if (!uploaded.ok) throw new Error(`Upload failed (${uploaded.status})`);
  const evidence = {
    file_size_bytes: bytes.length,
    content_sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  await saveCompletionEvidence(recordingId, evidence);
  const completed = await post(path + '/upload-complete', evidence);
  if (completed.status === 425) return { state: 'verification_pending' };
  if (completed.status !== 200) throw new Error(`Completion failed (${completed.status})`);
  return { state: 'completed', recordingId };
}
```

`assertAllowedUploadDestination` and `saveCompletionEvidence` are explicit
application-owned policy/durability integration points. An exception after
submission can mean an unknown outcome; do not log fetch errors containing a
signed URL. `Idempotency-Key` is not required for exact recording-scoped
completion replay; conflicting stored size/duration/hash returns 409.

The API SDK candidate has no recording-create/upload methods. Use server HTTP
instead of fictional `getUploadUrl`/`completeUpload` SDK calls.

## Contract references

- [Pinned recording inputs](https://github.com/bota-dev/bota/blob/2c388b098d4e0d8a4d3893018fed47a870305795/api/src/routes/v1/recordings/validation.ts)
- [Create](https://docs.bota.dev/api-reference/recordings/create), [destination](https://docs.bota.dev/api-reference/uploads/create-url), [completion/recovery](https://docs.bota.dev/api-reference/uploads/complete)
- [API SDK cohort](https://github.com/bota-dev/api-sdk/blob/3546bc71da16885f664aaa7d057e5baddc0ba13b/packages/typescript/README.md)

These examples do not prove live S3/backend or physical encrypted-v2 acceptance.
