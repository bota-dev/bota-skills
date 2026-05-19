# Skill: Auto-Processing

## Purpose

Enable Bota's zero-code transcription and summary pipeline. Once configured, every uploaded recording is automatically transcribed and summarized — no manual API calls needed.

## When to Use

- You want transcripts and summaries without calling `/v1/transcriptions` and `/v1/summaries` yourself
- All recordings in a project (or for a specific end user) should use the same processing config
- You want to reduce webhook handler complexity by receiving results instead of triggering jobs

## How It Works

```
upload-complete
  → Bota detects auto_transcription: true
  → Creates transcription job automatically
  → Fires transcription.completed webhook
  → Detects auto_summary: true
  → Creates summary job automatically
  → Fires summary.completed webhook
```

You configure the pipeline once at the project level (or override per end user or device). After that, just upload and wait for webhooks.

## Configuration Hierarchy

Settings cascade from broad to narrow, with narrower settings taking precedence:

```
Organization
  └── Project          ← set once for all users
        └── EndUser    ← override per user if needed
              └── Device  ← override per device if needed
```

Most integrations only configure at the project level.

## Implementation

### Enable Auto-Processing at Project Level

```bash
curl -X PUT https://api.bota.dev/v1/projects/config/processing \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "auto_transcription": true,
    "auto_summary": true,
    "summary_template_id": "tmpl_general_notes",
    "transcription": {
      "language": "en",
      "speaker_diarization": true
    }
  }'
```

After this, every `upload-complete` call in your project triggers transcription and summary automatically.

### Summary Templates

| Template ID | Name | Output Fields |
|-------------|------|---------------|
| `tmpl_general_notes` | General Notes | key_points, action_items, participants, decisions, overview |
| `tmpl_sales_call` | Sales Call | pain_points, budget, timeline, next_steps, key_quotes, sentiment |
| `tmpl_clinical_soap` | Clinical SOAP | chief_complaint, subjective, objective, assessment, plan |
| `tmpl_legal_memo` | Legal Memo | facts, issues, analysis, conclusion, parties_involved |

### Override for a Specific End User

```bash
curl -X PUT https://api.bota.dev/v1/end-users/eu_01HXYZ.../config/processing \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "summary_template_id": "tmpl_clinical_soap"
  }'
```

This user gets the SOAP template; all others get the project default.

### Manual Transcription (without auto-processing)

If you prefer explicit control, call `/v1/transcriptions` after upload:

```bash
curl -X POST https://api.bota.dev/v1/transcriptions \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "recording_id": "rec_01HDEF...",
    "language": "en",
    "speaker_diarization": true
  }'
```

```json
{
  "id": "txn_01HJKL...",
  "recording_id": "rec_01HDEF...",
  "status": "processing"
}
```

Then wait for the `transcription.completed` webhook.

### Manual Summary (after transcription)

```bash
curl -X POST https://api.bota.dev/v1/summaries \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "transcription_id": "txn_01HJKL...",
    "template_id": "tmpl_sales_call"
  }'
```

Or with a custom prompt instead of a template:

```bash
-d '{
  "transcription_id": "txn_01HJKL...",
  "prompt": "Summarize the key decisions made and who is responsible for each action item."
}'
```

### TypeScript — Receiving Auto-Processing Results

```typescript
// Your webhook handler receives results automatically
app.post("/webhooks/bota", express.raw({ type: "application/json" }), (req, res) => {
  // Verify signature first (see webhook-handling skill)

  const event = JSON.parse(req.body.toString());
  res.status(200).json({ received: true });

  if (event.event === "summary.completed") {
    const { summary_id, recording_id, end_user_id } = event.data;

    // Fetch the summary content
    bota.summaries.get(summary_id).then(summary => {
      // summary.content contains the structured output
      // e.g. summary.content.key_points, summary.content.action_items
      saveSummaryToYourSystem(end_user_id, recording_id, summary.content);
    });
  }
});
```

### TypeScript — Full Setup (one-time)

```typescript
import Bota from "@bota.dev/node";

const bota = new Bota({ apiKey: process.env.BOTA_API_KEY! });

// Run once during your app's bootstrap / deployment
async function configurePipeline() {
  await bota.projects.updateProcessingConfig({
    auto_transcription: true,
    auto_summary: true,
    summary_template_id: "tmpl_general_notes",
    transcription: {
      language: "en",
      speaker_diarization: true,
    },
  });

  console.log("Auto-processing configured");
}
```

## Gotchas

**Auto-processing triggers on `upload-complete`, not on S3 upload.** You must call `POST /v1/recordings/:id/upload-complete` to signal that the file is ready. Uploading to S3 alone does nothing.

**Config hierarchy is additive.** A narrower config only overrides fields it explicitly sets. If a project config sets `auto_transcription: true` and `auto_summary: true`, and an end user config sets only `summary_template_id`, the end user inherits `auto_transcription: true` from the project.

**`auto_summary` requires `auto_transcription: true`.** You can't auto-summarize without a transcription.

**Template vs. custom prompt is mutually exclusive.** Use `template_id` or `prompt`, not both.

**Processing is asynchronous.** After `upload-complete`, the API returns immediately. The transcription job is queued. Expect the `transcription.completed` webhook within 1–5 minutes depending on recording length.

**Test mode works the same.** Use `sk_test_*` to test the full pipeline without being billed. Use synthetic or short audio to keep test cycles fast.

## Reference

- [Auto-Processing Guide](https://docs.bota.dev/guides/auto-processing) — full pipeline documentation
- [Hierarchical Config](https://docs.bota.dev/guides/hierarchical-config) — org → project → end_user → device overrides
- [Transcriptions API](https://docs.bota.dev/api-reference/ai/transcriptions)
- [Summaries API](https://docs.bota.dev/api-reference/ai/summaries)
- [Webhook Handling Skill](../webhook-handling/skill.md) — receive processing results
- [Recording Upload Skill](../recording-upload/skill.md) — upload audio to trigger the pipeline
