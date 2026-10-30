# Skill: Bota CLI

## When to use

Inspect an authorized Bota project from a terminal, or configure the CLI's local
MCP process. Use the API SDK for application code and Platform for webhook setup.

## Select the release and credential

This recipe targets the public prerelease
[`@bota.dev/cli@0.2.0-beta.0`](https://www.npmjs.com/package/@bota.dev/cli/v/0.2.0-beta.0)
from the [pinned CLI source](https://github.com/bota-dev/bota-cli/blob/2061654fed140ef65e3fa41e64b10e15af6a4123/README.md).
Select it explicitly with `npm install --global @bota.dev/cli@0.2.0-beta.0`.
An unversioned install follows `latest`, which can select an older cohort.
Check the exact package record, provenance, `bota --version`, the
[CLI guide](https://docs.bota.dev/cli) and `--help` before use. Package delivery
does not establish a matching backend deployment or live integration acceptance.

Have your secret manager inject `BOTA_API_KEY` into the process environment. Do
not put a real key in a command, generated configuration or assistant prompt.
The legacy browser key-export flow is retired. Without an explicit developer
deployment, no-argument `auth login` remains configuration off.

The cohort contains client support for protected Platform enrollment/recovery
and shared CLI/MCP sessions through fixed `--developer-deployment dev` or
`--developer-deployment prod` selection and an explicit `--developer-profile`.
Local MCP requires `--mode hosted` and never starts login itself. These source
selectors and package availability do not establish production activation or
real installed acceptance. Verify the selected deployment's enrollment and
Portal configuration before using this path.
Use only an existing Platform account with active organization owner/admin
access to the chosen project and explicit read-scope consent. Enrollment is
self-service within those existing permissions. Account creation remains separate.
Follow the [CLI guide](https://docs.bota.dev/cli)
for host requirements and exact named recovery; never invent an issuer or fall
back from a refused developer profile to an API key.

To choose the browser yourself, add `--no-browser` to Platform login:

```bash
bota --developer-deployment prod auth login --name prod-work --scope devices:read --no-browser
```

The CLI emits the authorization URL on stderr only after protected custody
acknowledges. Keep the command running and open the complete URL in a browser
on the same computer for its owned loopback callback. The default still opens
the operating system's browser. Keep the transient URL out of saved logs, issue
receipts and shared chat; it contains no token, authorization code or verifier.
Manual handoff leaves PKCE, consent, deadlines and named recovery unchanged.

## Enroll an explicit environment profile

For a matching CLI version and backend:

```bash
bota --api-url https://api.bota.dev auth profiles add work --from-env
bota auth profiles list --json
bota --profile work auth status --json
bota --profile work devices list --limit 20
bota --profile work recordings list --limit 20
```

Environment profiles retain only origin/project/organization metadata. Each CLI
operation requires the injected key and verifies its identity against that
profile. Wrong, empty or rejected input never falls back to a legacy saved key.
Conflicting API origins fail. Use `auth profiles remove work` for metadata removal;
it does not revoke the server key or stop an existing MCP process.

## Secure profiles on supported hosts

The cohort also offers Windows x64/local NTFS OS credential storage on the
qualified Node builds. Enroll with hidden input, then select it explicitly:

```bash
bota --api-url https://api.bota.dev auth secure-profiles add work --key-prompt
bota --secure-profile work auth status --json
bota --secure-profile work devices list
bota auth secure-profiles list --json
```

Supported storage, ancestor permissions and runtime checks must succeed. Refusal
has no plaintext fallback; do not bypass it by changing roots or permissions.
Secure profiles reread state and current identity while owning their namespace
lock through each action. Pending recovery blocks use. Use explicit `recover`
or `remove`; removal is local and does not revoke the project API key.

Do not combine `--profile` and `--secure-profile`. Existing no-profile selection
prefers a legacy saved key over the environment. Explicit `auth login <key>`
remains legacy plaintext compatibility and is unsuitable for secret-safe setup.

## Run an authorized task

Start with identity and a bounded read. Identity includes safe project/key IDs,
credential type and scopes; its test flag does not establish billing/data isolation.
Processing, integration tests and webhook tests can have remote effects. A timeout
or lost response is not permission to repeat a mutation. Inspect recorded state
before deciding on another operation. Keep provider keys in Platform or the
documented `--key-stdin` flow, never tool arguments/model context.

See [local MCP](../local-mcp/skill.md), [hosted MCP](../hosted-mcp/skill.md),
[shared auth](../shared-auth/skill.md) and the canonical [CLI guide](https://docs.bota.dev/cli).
