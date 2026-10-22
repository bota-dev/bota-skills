# Bota Skills

Customer integration recipes for AI assistants using the [Bota API](https://docs.bota.dev).

The ten recipes are **source-reviewed** against the pinned contracts in their
references. The catalog records each guide's content digest and qualification
boundary. Source review and synthetic checks do not certify live deployment,
physical devices, package publication or your application's persistence/security.

This repository contains customer integration recipes. The internal Bota engineering plugin, also named `bota-skills`, is maintained separately. Reading or installing a recipe grants no execution authority.

## Current references and coverage

- [API reference](https://docs.bota.dev/api-reference/introduction)
- [API SDK source and supported cohort](https://github.com/bota-dev/api-sdk), including candidate release status
- [CLI guide](https://docs.bota.dev/cli) and [source](https://github.com/bota-dev/bota-cli), including published versus source-preview behavior
- [Local and hosted MCP setup](https://docs.bota.dev/mcp-server)
- [Authentication](https://docs.bota.dev/authentication)

The API SDK and CLI guides distinguish unpublished source candidates from public
package availability. Shared Platform login remains inactive; the auth guide
describes supported API-key workflows and the remaining enrollment boundary.

## Skills

| Skill | What It Covers |
|-------|---------------|
| [Device Registration](device-registration/skill.md) | Register and prepare, physically verify, then confirm or abort an exact binding attempt |
| [Recording Upload](recording-upload/skill.md) | Ordinary server audio import and verified completion; separate encrypted-v2 device acceptance |
| [Webhook Handling](webhook-handling/skill.md) | Platform-managed endpoints, timestamp-bound raw-body signatures and durable deduplication |
| [Auto-Processing](auto-processing/skill.md) | Inspect/change nested processing configuration and verify actual job outcomes |
| [Streaming Upload](streaming-upload/skill.md) | Compatibility HTTP chunks, ordered assembly and retained-source recovery |
| [API SDK](api-sdk/skill.md) | Candidate TypeScript/async Python clients and supported read/end-user-write cohorts |
| [CLI](cli/skill.md) | Explicit origins, API-key profiles, identity checks and authorized terminal tasks |
| [Local MCP](local-mcp/skill.md) | Noninteractive stdio setup and local compatibility tool contracts |
| [Hosted MCP](hosted-mcp/skill.md) | Direct HTTP versus hosted stdio bridging, authorized discovery and uncertain outcomes |
| [Shared Authentication](shared-auth/skill.md) | Project keys/profiles, end-user tokens, distinct device/upload authority and login status |

## Usage

Keep API keys, tokens and webhook secrets out of prompts and model context. Supply credentials through your server or the tool's supported credential setup; use placeholders when discussing an integration with an assistant.

### With Claude Code or Cursor

Add the skill as context, then ask your question:

```
@bota-skills/recording-upload/skill.md

How do I import a server-owned audio file and verify completion?
```

### With any LLM

Provide the relevant recipe text as context, then verify its steps against the current references above.

### Machine-readable catalog

`index.json` version 1.1.0 lists the guides and SHA-256 over UTF-8 content with
CRLF normalized to LF. Hashes detect content drift; they do not authenticate a
publisher or grant execution authority. `contracts.json` pins the public HTTP
operation inventory used by the catalog check; it does not validate full request
or response schemas. Updating a guide requires review and an explicit digest
refresh, not blind acceptance of a changed hash.

Run credential-free checks with Node 22.23.2 or 24.19.0:

```bash
node scripts/check-catalog.mjs
node --test tests/*.test.mjs webhook-handling/tests/*.test.mjs
```

CI checks inventory, links, JSON examples, JavaScript syntax, pinned source references, content
integrity refusal and the executable webhook verifier. Application-owned durable
queues/provisioning/upload policy, full SDK/CLI client scenarios, real services
and physical-device acceptance remain separate verification work. To also
reconstruct the recorded operations from the exact source OpenAPI bytes, use
`node scripts/check-catalog.mjs --openapi /path/to/pinned-openapi.json`.
The standalone CI checks the recorded inventory's digest; it does not fetch
or independently regenerate a private upstream contract. Access and
licensing of this repository are independent of SDK/CLI MIT approvals.

## About Bota

Bota is a **B2B2C platform** — you are the developer integrating the API; your end users wear the devices and never interact with Bota directly. Your backend calls the Bota API on behalf of your end users.

- [Full API reference](https://docs.bota.dev)
- [llms-full.txt](https://docs.bota.dev/llms-full.txt) — single-document comprehensive reference for AI agents
- [API Introduction](https://docs.bota.dev/api-reference/introduction)
