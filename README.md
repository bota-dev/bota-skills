# Bota Skills

Agent-ready integration guides for the [Bota API](https://docs.bota.dev).

Each skill is a self-contained markdown file with working code, gotchas, and direct links to the relevant API reference. Drop a skill into your AI agent's context and it can implement the integration without hallucinating.

## Skills

| Skill | What It Covers |
|-------|---------------|
| [Device Registration](device-registration/skill.md) | Register a device, bind it to an end user, handle reassignment |
| [Recording Upload](recording-upload/skill.md) | Create a recording, get a presigned URL, upload to S3, complete |
| [Webhook Handling](webhook-handling/skill.md) | Register a webhook endpoint, verify HMAC-SHA256 signatures |
| [Auto-Processing](auto-processing/skill.md) | Enable zero-code transcription + summary pipeline |
| [Streaming Upload](streaming-upload/skill.md) | Chunked upload during recording for faster time-to-transcript |

## Usage

### With Claude Code or Cursor

Add the skill as context, then ask your question:

```
@bota-skills/recording-upload/skill.md

How do I upload a recording from my mobile app?
```

### With any LLM

Paste the skill content into your prompt or system message.

### Machine-readable catalog

`index.json` lists all skills with metadata for programmatic discovery.

## About Bota

Bota is a **B2B2C platform** — you are the developer integrating the API; your end users wear the devices and never interact with Bota directly. Your backend calls the Bota API on behalf of your end users.

- [Full API reference](https://docs.bota.dev)
- [llms-full.txt](https://docs.bota.dev/llms-full.txt) — single-document comprehensive reference for AI agents
- [API Introduction](https://docs.bota.dev/api-reference/introduction)
