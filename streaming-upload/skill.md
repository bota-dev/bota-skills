# Skill: Streaming Upload

## When to use

Use when maintaining the **legacy HTTP chunk-upload compatibility protocol**
for an already authorized deployment/device. This is not partial transcription,
durable cross-network resume or encrypted-upload-v2 acceptance. Keep a full
independently recoverable source until final verification.

New App SDK physical-device acceptance remains encrypted-upload-v2 only. Do
not bypass `encrypted_upload_v2_required`, substitute legacy completion for a
signed receipt, or erase unknown uploads/journals. Ordinary `bota.stream.v1`
WebSocket and default-disabled protected streaming are separate protocols.

## Compatibility sequence

| Step | Exact HTTP contract |
| --- | --- |
| Create | `POST /v1/recordings` with `streaming: true`; not `upload_type` |
| Destination | `POST /v1/recordings/{id}/chunks/{chunk_number}/upload-url`; **one-based** sequence |
| Upload | PUT that complete chunk to its signed destination; no project bearer |
| Finalize | `POST /v1/recordings/{id}/finalize` with `total_chunks` and full-file `content_sha256` |

There is no per-chunk `/upload-complete` step. Arrival may be out of order;
assembly never skips a sequence. Preserve chunk identity and recording pointers.
Do not recreate a recording to escape an uncertain response.

Use server `BOTA_API_KEY`, or the device's activated token inside its device
integration. Never give project keys to devices/mobile apps or models.
Restricted keys require `recordings:write`; ownership/upload policy still apply.

## Server HTTP example

The caller already owns the recording, immutable completed chunks and final
manifest. Credentials are environment-held; loading this guide is not
authorization to perform these mutations.

```javascript
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

async function putChunk(recordingId, chunkNumber, bytes) {
  if (!Number.isSafeInteger(chunkNumber) || chunkNumber < 1) throw new Error('Invalid chunk sequence');
  const response = await post(`/recordings/${encodeURIComponent(recordingId)}/chunks/${chunkNumber}/upload-url`, {});
  if (!response.ok) throw new Error(`Chunk destination failed (${response.status})`);
  const { upload_url } = await response.json();
  assertAllowedUploadDestination(upload_url);
  const uploaded = await fetch(upload_url, {
    method: 'PUT', redirect: 'error', credentials: 'omit',
    signal: AbortSignal.timeout(30_000), body: bytes,
  });
  if (!uploaded.ok) throw new Error(`Chunk PUT failed (${uploaded.status})`);
}

async function submitFinalManifest(recordingId, manifest) {
  // Persist the manifest first; never change it during 425 recovery.
  if (!manifest || !Number.isSafeInteger(manifest.total_chunks) ||
      manifest.total_chunks < 1 || manifest.total_chunks > 10000 ||
      typeof manifest.content_sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(manifest.content_sha256)) {
    throw new Error('A bounded chunk count and full-file SHA-256 are required');
  }
  const response = await post(`/recordings/${encodeURIComponent(recordingId)}/finalize`, manifest);
  if (response.status === 425) return { state: 'verification_pending' };
  if (response.status !== 200) throw new Error(`Finalization failed (${response.status})`);
  return { state: 'verified', recordingId };
}
```

`assertAllowedUploadDestination` is application-owned policy. The final manifest
contains positive `total_chunks` (at most 10000), lowercase full-file SHA-256,
and optionally `final_duration_ms`, `final_file_size_bytes`, and bounded
`trailer_base64` for actual encoder closing bytes. Reported expected size alone
is not integrity proof; never manufacture/repair trailer bytes.

## Completion and repair

- `425 upload_verification_pending`: retain sources; retry the identical final
  manifest with bounded backoff. Stop at the caller's deadline.
- `409 upload_chunks_missing`: inspect inclusive `{start,end}` sequences in
  `error.missing_ranges`. Explicitly authorized repair can upload those exact
  chunks, then retry the unchanged manifest.
- Integrity failure/unknown response: retain source/pointers and inspect state.
  Do not automatically recreate, re-upload everything, switch protocols or
  delete local data.
- `200`: ordered audio is published and a supplied full-file hash is verified.
  A notification alone does not supply a device cleanup receipt.

S3 PUT is not byte-offset resume. A network switch does not prove partial
progress reusable. URL lifetime comes from its response; chunk URLs currently
report `expires_in: 900`. Processing starts after accepted assembly, not after
each chunk. No fixed time-to-transcript is promised.

Retired `@bota.dev/react-native-sdk` examples and invented
`BotaDevice.startStreamingSync`/API SDK chunk helpers are not this contract.

## Contract references

- [Pinned recording routes](https://github.com/bota-dev/bota/blob/2c388b098d4e0d8a4d3893018fed47a870305795/api/src/routes/v1/recordings/index.ts) and [inputs](https://github.com/bota-dev/bota/blob/2c388b098d4e0d8a4d3893018fed47a870305795/api/src/routes/v1/recordings/validation.ts)
- [Streaming/recovery](https://docs.bota.dev/guides/streaming-upload), [finalization](https://docs.bota.dev/api-reference/recordings/finalize-streaming)
- [Encrypted-v2](https://docs.bota.dev/api-reference/uploads/encrypted-v2), [protected streaming](https://docs.bota.dev/api-reference/uploads/protected-streaming)
- [API SDK cohort](https://github.com/bota-dev/api-sdk/blob/3546bc71da16885f664aaa7d057e5baddc0ba13b/packages/typescript/README.md)

Live device/firmware/S3 acceptance and optional protocol enablement remain
separate from this source contract.
