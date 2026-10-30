# Skill: Local Bota MCP

## When to use

Connect an assistant that launches a local stdio process to selected Bota cloud
operations. The process is an API adapter; it does not grant BLE, filesystem,
microphone or local-device authority.

## Configure without credentials in model context

Use the `0.2.0-beta.0` CLI cohort matching the [source contract](https://github.com/bota-dev/bota-cli/blob/2061654fed140ef65e3fa41e64b10e15af6a4123/README.md).
Check the exact public package record and `bota --version`; a source checkout
or an unversioned install does not establish this cohort. Enroll and verify a
project API-key profile outside MCP
first, following [CLI setup](../cli/skill.md).

For a client that launches local commands, configure the equivalent of:

```json
{
  "mcpServers": {
    "bota": {
      "command": "bota",
      "args": ["--profile", "work", "mcp", "--mode", "legacy"]
    }
  }
}
```

Inject `BOTA_API_KEY` using the launcher's supported secret/environment facility;
the example intentionally contains no key. GUI launchers may not inherit a shell
environment. On a qualified Windows host, an enrolled `--secure-profile work`
can replace `--profile work`. Neither mode starts browser consent or prompts on
MCP stdin. Keep protocol stdout reserved for MCP messages.

## Understand the selected tool contract

`legacy` is the default local compatibility mode. It has curated end-user,
device and recording reads, processing requests and selected administration/test
tools. It does not expose every CLI command or the complete hosted inventory.
Its compatibility list/detail shapes can differ from hosted results; use the
actual tool schemas and returned cursor. `list_webhooks` remains a compatibility
error because webhook management belongs in Platform.

Read scopes still apply on the backend; tool visibility alone grants no right to
invoke an operation. Processing or webhook/provider test tools can consume
capacity or send data. Read their effect description and use the human's task
authorization before invoking them. A tool failure or interruption can leave an
unknown remote outcome; inspect state instead of automatically replaying it.

## Credential changes and shutdown

Environment-v1 profiles verify at startup and retain that process's selected
credential. Restart after changing the injected key or profile; deleting metadata
does not revoke a running process. Secure profiles instead reread state and verify
current identity for each discovery/call; removed/pending state stops later
requests. Backend admission remains authoritative in both cases.

For hosted schema/result parity through stdio, explicitly choose
[`--mode hosted`](../hosted-mcp/skill.md). Do not silently fall back between modes.
Platform delegated login requires matching deployed enrollment/Portal
configuration and operating verification. API-key enrollment is independent.

For a qualified Platform session, run `auth login --no-browser` separately from
MCP if you want to choose the browser. The CLI emits its authorization URL on
stderr only after protected custody acknowledges; open it in a browser on the
same computer while the command waits for its loopback callback. The default
OS-browser launch is unchanged. Keep URLs and proofs out of saved logs, issue
receipts and shared chat. After enrollment, use the developer profile with
`--mode hosted`.
