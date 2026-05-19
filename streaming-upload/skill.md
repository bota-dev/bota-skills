# Skill: Streaming Upload

## Purpose

Upload audio chunks to Bota while recording is still in progress. By the time recording ends, most audio is already in the cloud — reducing time-to-transcript from "recording + upload + processing" to "recording + ~2 minutes."

## When to Use

- Recordings longer than 30 minutes (medical consultations, depositions, long meetings)
- 4G or WiFi-enabled devices recording in the field
- When the end user needs their transcript ready as quickly as possible after recording ends
- BLE devices where the phone stays nearby throughout the recording

## Prerequisites

- A recording created with `upload_type: "streaming"`
- A connectivity path: WiFi, 4G, Wi-Fi Direct, or BLE via the React Native SDK
- For BLE path: `@bota.dev/react-native-sdk` installed in your mobile app

## How It Works

The device uses **double buffering** — recording into one buffer while the previous buffer uploads:

```
Record → Buffer A fills → swap → upload Buffer A → Record → Buffer B fills → swap → ...
                                                                         → finalize
```

**Backend steps:**

```
POST /v1/recordings (upload_type: streaming)  ← create before recording starts
  ↓ (upload chunks as they complete)
POST /v1/recordings/:id/upload-url            ← one per chunk, with chunk_index
PUT  <presigned-url>                          ← upload each chunk to S3
POST /v1/recordings/:id/upload-complete       ← mark each chunk uploaded
  ↓ (after recording ends)
POST /v1/recordings/:id/finalize              ← stitch all chunks → trigger processing
```

## Implementation

### Step 1 — Create the Recording (before recording starts)

```bash
curl -X POST https://api.bota.dev/v1/recordings \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "end_user_id": "eu_01HXYZ...",
    "device_id": "dev_01HABC...",
    "upload_type": "streaming",
    "recorded_at": "2025-01-15T09:00:00Z"
  }'
```

```json
{
  "id": "rec_01HDEF...",
  "status": "created",
  "upload_type": "streaming"
}
```

### Step 2 — Upload Each Chunk

For each completed chunk (repeat as chunks arrive):

```bash
# Get upload URL for chunk N
curl -X POST https://api.bota.dev/v1/recordings/rec_01HDEF.../upload-url \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "content_type": "audio/ogg",
    "chunk_index": 0
  }'
```

```json
{
  "upload_url": "https://bota-uploads.s3.amazonaws.com/rec_01HDEF.../chunk-0.ogg?...",
  "expires_at": "2025-01-15T09:20:00Z"
}
```

```bash
# Upload the chunk to S3
curl -X PUT "<upload_url>" \
  -H "Content-Type: audio/ogg" \
  --data-binary @chunk-0.ogg

# Mark chunk as uploaded
curl -X POST https://api.bota.dev/v1/recordings/rec_01HDEF.../upload-complete \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{ "chunk_index": 0 }'
```

Increment `chunk_index` for each chunk (0, 1, 2, ...).

### Step 3 — Finalize After Recording Ends

```bash
curl -X POST https://api.bota.dev/v1/recordings/rec_01HDEF.../finalize \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{ "total_chunks": 12 }'
```

```json
{
  "id": "rec_01HDEF...",
  "status": "uploaded",
  "total_chunks": 12,
  "missing_chunks": []
}
```

If `missing_chunks` is non-empty, re-upload those specific chunks and call finalize again.

### TypeScript (Backend — Managing Chunks)

```typescript
import Bota from "@bota.dev/node";

const bota = new Bota({ apiKey: process.env.BOTA_API_KEY! });

class StreamingUploadSession {
  private chunkIndex = 0;

  constructor(private readonly recordingId: string) {}

  async uploadChunk(audioBuffer: Buffer): Promise<void> {
    const index = this.chunkIndex++;

    const { upload_url } = await bota.recordings.getUploadUrl(this.recordingId, {
      content_type: "audio/ogg",
      chunk_index: index,
    });

    // Upload directly to S3
    await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": "audio/ogg" },
      body: audioBuffer,
    });

    await bota.recordings.completeChunkUpload(this.recordingId, { chunk_index: index });
  }

  async finalize(): Promise<void> {
    const result = await bota.recordings.finalize(this.recordingId, {
      total_chunks: this.chunkIndex,
    });

    if (result.missing_chunks.length > 0) {
      throw new Error(`Missing chunks: ${result.missing_chunks.join(", ")} — re-upload and retry`);
    }
  }
}

// Usage
app.post("/api/recordings/start-streaming", async (req, res) => {
  const { endUserId, deviceId } = req.body;

  const recording = await bota.recordings.create({
    end_user_id: endUserId,
    device_id: deviceId,
    upload_type: "streaming",
    recorded_at: new Date().toISOString(),
  });

  // Return recording ID — the device/app will use it for chunk uploads
  res.json({ recording_id: recording.id });
});
```

### React Native SDK (BLE Streaming)

For BLE devices, the SDK manages the streaming transparently:

```typescript
import { BotaDevice } from "@bota.dev/react-native-sdk";

// The SDK handles chunking, buffering, and re-upload automatically
const session = await BotaDevice.startStreamingSync({
  deviceId: "dev_01HABC...",
  recordingId: "rec_01HDEF...",  // created by your backend
  uploadTokenEndpoint: "/api/recordings/upload-token",  // your backend issues upload tokens
  chunkDurationSeconds: 300,  // 5-minute chunks
});

// SDK fires callbacks as chunks upload
session.onChunkUploaded(({ chunkIndex, totalUploaded }) => {
  console.log(`Chunk ${chunkIndex} uploaded`);
});

session.onComplete(() => {
  // SDK has called finalize — recording is processing
});
```

## Chunk Size

| Chunk Duration | File Size (Opus 32kbps) | Recommendation |
|----------------|-------------------------|----------------|
| 1 minute | ~250 KB | Maximum real-time feedback |
| **5 minutes** | **~1.25 MB** | **Recommended default** |
| 10 minutes | ~2.5 MB | Fewer round trips |
| 15 minutes | ~3.75 MB | Very long recordings only |

## Gotchas

**Create the recording before recording starts, not after.** The recording ID must be established before any chunks can be associated with it.

**`chunk_index` must be zero-based and contiguous.** Bota stitches chunks in order. Gaps are detected at finalize time and reported as `missing_chunks`.

**Finalize is idempotent with the same `total_chunks`.** Safe to retry if your network drops during the finalize call.

**Missing chunks at finalize don't fail immediately.** The response includes a `missing_chunks` array. Upload the missing chunks (by index) and call finalize again.

**Network switches mid-upload are safe.** S3 presigned URLs support HTTP range requests, so a chunk upload interrupted by a network switch can resume from the byte offset where it stopped.

**BLE streaming is an optimization, not a requirement.** If Bluetooth disconnects mid-recording, the device continues recording to its SD card and can batch-sync later. The streaming session simply stops, and finalize can be called after a subsequent batch sync fills the missing chunks.

**Chunk upload URLs expire in 15 minutes.** Fetch a new URL for each chunk close to when you're ready to upload it.

## Reference

- [Streaming Upload Guide](https://docs.bota.dev/guides/streaming-upload)
- [Create Recording](https://docs.bota.dev/api-reference/recordings/create)
- [Get Upload URL](https://docs.bota.dev/api-reference/uploads/create-url)
- [Finalize Recording](https://docs.bota.dev/api-reference/recordings/finalize-streaming)
- [Connectivity Guide](https://docs.bota.dev/guides/connectivity) — WiFi, cellular, BLE paths
- [Recording Upload Skill](../recording-upload/skill.md) — standard (non-streaming) upload
