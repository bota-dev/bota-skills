# Bota Skills

Customer integration recipes for AI assistants using the [Bota API](https://docs.bota.dev).

The five recipe files are **under review** against the current API and SDK contracts. Their examples may be stale and are not yet certified for the current developer toolchain. Check the current references below before using a recipe.

This repository contains customer integration recipes. The internal Bota engineering plugin, also named `bota-skills`, is maintained separately. Reading or installing a recipe grants no execution authority.

## Current references and coverage

- [API reference](https://docs.bota.dev/api-reference/introduction)
- [API SDK source and supported cohort](https://github.com/bota-dev/api-sdk), including candidate release status
- [CLI guide](https://docs.bota.dev/cli) and [source](https://github.com/bota-dev/bota-cli), including published versus source-preview behavior
- [Local and hosted MCP setup](https://docs.bota.dev/mcp-server)
- [Authentication](https://docs.bota.dev/authentication)

CLI, local/hosted MCP, and shared authentication recipes are not included here yet. Follow the current tool-specific references for their supported behavior.

## Skills

| Skill | What It Covers |
|-------|---------------|
| [Device Registration](device-registration/skill.md) | Register a device, bind it to an end user, handle reassignment |
| [Recording Upload](recording-upload/skill.md) | Create a recording, get a presigned URL, upload to S3, complete |
| [Webhook Handling](webhook-handling/skill.md) | Register a webhook endpoint, verify HMAC-SHA256 signatures |
| [Auto-Processing](auto-processing/skill.md) | Enable zero-code transcription + summary pipeline |
| [Streaming Upload](streaming-upload/skill.md) | Chunked upload during recording for faster time-to-transcript |

## Usage

Keep API keys, tokens and webhook secrets out of prompts and model context. Supply credentials through your server or the tool's supported credential setup; use placeholders when discussing an integration with an assistant.

### With Claude Code or Cursor

Add the skill as context, then ask your question:

```
@bota-skills/recording-upload/skill.md

How do I upload a recording from my mobile app?
```

### With any LLM

Provide the relevant recipe text as context, then verify its steps against the current references above.

### Machine-readable catalog

`index.json` lists all skills with metadata for programmatic discovery; a catalog entry does not certify current API compatibility.

## About Bota

Bota is a **B2B2C platform** — you are the developer integrating the API; your end users wear the devices and never interact with Bota directly. Your backend calls the Bota API on behalf of your end users.

- [Full API reference](https://docs.bota.dev)
- [llms-full.txt](https://docs.bota.dev/llms-full.txt) — single-document comprehensive reference for AI agents
- [API Introduction](https://docs.bota.dev/api-reference/introduction)
