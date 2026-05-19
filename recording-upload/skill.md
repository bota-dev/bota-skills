# Skill: Recording Upload

## Purpose

Upload an audio recording from a Bota device to the cloud so it can be transcribed and summarized.

## When to Use

- A BLE device finishes recording and transfers audio to your mobile app via Bluetooth
- Your backend needs to upload audio on behalf of a user
- You want to test the pipeline with a pre-recorded audio file

## Prerequisites

- A Bota secret key (`sk_live_*` or `sk_test_*`) — for your backend
- An end user (`eu_*`) and bound device (`dev_*`) already created
- The audio file — Bota accepts Opus, MP3, WAV, M4A, FLAC, WebM

## How It Works

```
Device (records audio)
  → Mobile App (receives audio over BLE)
    → Your Backend
      → POST /v1/recordings          (create the record)
      → POST /v1/recordings/:id/upload-url  (get presigned S3 URL)
    → Mobile App
      → PUT <presigned-url>           (upload directly to S3)
    → Your Backend
      → POST /v1/recordings/:id/upload-complete  (trigger processing)
```

Your app uploads directly to S3 — audio never passes through your backend. The backend only handles the metadata and signed URL.

## Implementation

### Step 1 — Create the Recording Record

```bash
curl -X POST https://api.bota.dev/v1/recordings \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "end_user_id": "eu_01HXYZ...",
    "device_id": "dev_01HABC...",
    "duration_seconds": 3600,
    "recorded_at": "2025-01-15T09:00:00Z"
  }'
```

```json
{
  "id": "rec_01HDEF...",
  "end_user_id": "eu_01HXYZ...",
  "device_id": "dev_01HABC...",
  "status": "created",
  "duration_seconds": 3600,
  "recorded_at": "2025-01-15T09:00:00Z",
  "created_at": "2025-01-15T10:05:00Z"
}
```

### Step 2 — Get the Presigned Upload URL

```bash
curl -X POST https://api.bota.dev/v1/recordings/rec_01HDEF.../upload-url \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "content_type": "audio/ogg"
  }'
```

```json
{
  "upload_url": "https://bota-uploads.s3.amazonaws.com/rec_01HDEF.../audio.ogg?X-Amz-...",
  "expires_at": "2025-01-15T10:20:00Z"
}
```

The URL expires in 15 minutes. Get it close to when you're ready to upload.

### Step 3 — Upload Directly to S3

```bash
curl -X PUT "<upload_url>" \
  -H "Content-Type: audio/ogg" \
  --data-binary @/path/to/recording.ogg
```

Use the exact `Content-Type` you specified in Step 2. No `Authorization` header — the URL is self-authenticating.

### Step 4 — Complete the Upload

```bash
curl -X POST https://api.bota.dev/v1/recordings/rec_01HDEF.../upload-complete \
  -H "Authorization: Bearer sk_live_..."
```

```json
{
  "id": "rec_01HDEF...",
  "status": "uploaded",
  "uploaded_at": "2025-01-15T10:06:00Z"
}
```

This signals Bota that the file is ready. If auto-processing is enabled, transcription starts immediately.

### TypeScript (Express backend + React Native app)

**Backend — generate upload URL:**

```typescript
import Bota from "@bota.dev/node";

const bota = new Bota({ apiKey: process.env.BOTA_API_KEY! });

app.post("/api/recordings/start", async (req, res) => {
  const { endUserId, deviceId, durationSeconds } = req.body;

  const recording = await bota.recordings.create({
    end_user_id: endUserId,
    device_id: deviceId,
    duration_seconds: durationSeconds,
    recorded_at: new Date().toISOString(),
  });

  const { upload_url } = await bota.recordings.getUploadUrl(recording.id, {
    content_type: "audio/ogg",
  });

  res.json({ recording_id: recording.id, upload_url });
});

app.post("/api/recordings/:id/complete", async (req, res) => {
  const recording = await bota.recordings.completeUpload(req.params.id);
  res.json({ status: recording.status });
});
```

**React Native app — upload audio:**

```typescript
// After BLE transfer completes
async function uploadRecording(audioPath: string, endUserId: string, deviceId: string) {
  // 1. Get upload URL from your backend
  const { recording_id, upload_url } = await fetch("/api/recordings/start", {
    method: "POST",
    body: JSON.stringify({ endUserId, deviceId, durationSeconds: 3600 }),
  }).then(r => r.json());

  // 2. Upload directly to S3
  const audio = await fetch(`file://${audioPath}`);
  const blob = await audio.blob();

  await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": "audio/ogg" },
    body: blob,
  });

  // 3. Complete via your backend
  await fetch(`/api/recordings/${recording_id}/complete`, { method: "POST" });
}
```

## Gotchas

**S3 upload uses the presigned URL directly — no Authorization header.** Adding one will break the request (S3 rejects requests with both a presigned token and an Authorization header).

**`Content-Type` must match exactly.** Specify it in `POST /upload-url` and use the same value in the `PUT` to S3. Mismatches cause S3 to reject the upload.

**Complete the upload even if you plan to process manually.** The `upload-complete` call changes the recording status to `uploaded`. Without it, auto-processing won't trigger and the recording stays in `created` status.

**Presigned URLs expire in 15 minutes.** Don't fetch the URL on app open and cache it — fetch it right before the upload.

**Duration is informational.** If you don't know the exact duration before upload, omit `duration_seconds` and Bota will measure it during transcription.

**Idempotency for retries.** If your mobile app might retry the `upload-complete` call on network failure, use `Idempotency-Key`:
```bash
-H "Idempotency-Key: complete-rec_01HDEF..."
```

## Reference

- [Create Recording](https://docs.bota.dev/api-reference/recordings/create)
- [Get Upload URL](https://docs.bota.dev/api-reference/uploads/create-url)
- [Complete Upload](https://docs.bota.dev/api-reference/uploads/complete)
- [Streaming Upload Skill](../streaming-upload/skill.md) — for long recordings
- [Auto-Processing Skill](../auto-processing/skill.md) — process automatically after upload
