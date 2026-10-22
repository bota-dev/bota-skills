# Skill: Hosted Bota MCP

## When to use

Connect an MCP client directly to Bota's cloud tool endpoint, or forward the same
authorized tool inventory through the CLI's local stdio bridge. Use local legacy
mode only when its distinct compatibility schemas are intended.

## Choose a connection

| Connection | Setup | Credential custody |
| --- | --- | --- |
| Direct HTTP | Configure the client's supported HTTP transport for `https://api.bota.dev/mcp` | Client secret/header facility holds the API key or enrolled end-user token |
| Local stdio bridge | Qualified CLI candidate: `bota --profile work mcp --mode hosted` | CLI profile/environment holds the project key |

Use the selected deployment's explicit trusted origin. Put `Authorization:
Bearer …` in a supported secret facility, never an actual token in a shared
config, shell history or model prompt. Check which secure storage/interpolation
features that client actually implements instead of inventing environment syntax.

The [CLI bridge source](https://github.com/bota-dev/bota-cli/blob/5270781b39ff59f7b889c58a288a59f63f50ca46/README.md)
is an unpublished source preview. Package installation and the matching backend
deployment are separate checks. [API-key setup](https://docs.bota.dev/mcp-server)
does not enable browser OAuth. Private delegated discovery/PKCE components exist
in backend source; they are not an activated public enrollment service.

## Verify role and capabilities

Project secret/restricted keys select developer tools. An `eut_*` credential
selects supported operations for its owning end user; it does not grant project
administration. Environment/secure CLI profiles accept project developer keys,
not arbitrary protocol/end-user tokens. Enroll end-user tokens through Platform
or your authenticated backend as described in [shared auth](../shared-auth/skill.md).

Discover the authorized tools at connection time. The hosted source filters
discovery and rechecks invocation. `get_recording` requires recordings,
transcriptions and summaries read scopes together. Existing `list_webhooks`
can include signing secrets and requires both webhook read/write scopes; avoid
requesting it merely to diagnose delivery. Webhook REST CRUD is not available.

## Bridge behavior and recovery

Hosted mode preserves the authorized schemas, annotations and complete final
result, including `structuredContent`, `_meta` and `isError`. It does not translate
hosted results into local legacy shapes or silently fall back to legacy mode.
The supported bridge cohort covers tool lists and final calls; it does not
promise progress/list-change notifications, resources/prompts, interactive
sampling/elicitation, tasks or resumable sessions.

The bridge bounds requests and does not automatically replay a submitted call.
Cancellation, disconnection and timeout can leave remote work running. Reconcile
the corresponding recording/job/delivery before another mutation; a cancellation
acknowledgement is not proof of rollback. Environment-profile processes require a
restart after credential changes; secure profiles reverify each list/call.

Use the [MCP contract](https://docs.bota.dev/mcp-server) and the exact source/release
support matrix when diagnosing unsupported clients, scopes or transport behavior.
