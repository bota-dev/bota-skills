# Skill: Shared Bota Developer Authentication

## When to use

Choose credentials for REST, the API SDK, CLI and local/hosted MCP, or explain
which login, profile removal or revocation affects an integration.

## Select the principal

| Credential | Intended authority | Where it belongs |
| --- | --- | --- |
| Project secret `sk_live_*` / `sk_test_*` | Broad server-side project access | Trusted customer server or supported developer secret store |
| Restricted key `rk_*` | Explicit project operation scopes | Server/CLI/MCP secret facility; scopes still checked per operation |
| End-user token `eut_*` | One user's supported MCP/Ask operations | That user's authorized client, issued through trusted enrollment |
| Device token `dtok_*` | Bound device protocol operations | Authorized physical-device provisioning and custody |
| Upload token `up_*` | One recording's short-lived upload capability | Owning upload flow only |
| Platform browser session | Platform account and organization actions | Platform browser; not a public REST/MCP bearer |

A user/device ID, profile label, stored scope list or test flag is not authority.
Do not send project credentials to device/mobile app code or documentation search.

## API-key sharing today

The same appropriately scoped project key can authorize supported REST, CLI and
MCP operations. Shared authentication does not mean every tool reads one file:

- API SDKs require explicit caller-managed credentials and do not import CLI stores.
- Environment CLI profiles save only verified origin/project/organization metadata;
  each invocation needs the injected key. Their MCP processes retain startup state.
- Supported Windows secure profiles put key bytes in OS storage and verify fresh
  identity per action/MCP request. Storage/permission refusal has no fallback.
- Direct hosted MCP clients own their secret configuration. The CLI bridge can
  instead use the selected CLI profile. Do not assume a remote client can read it.

See [CLI setup](../cli/skill.md) for exact candidate and host requirements. Preserve
origin/project binding when switching credentials. A mismatched or empty injected
key must not fall back to another account. Keep keys, refresh credentials and
webhook/provider secrets out of logs, prompts and generated source.

## Platform login status

The legacy browser key-export flow is retired. No-argument `bota auth login`
does not enable secure delegated Platform login. Its replacement remains inactive
pending initial-enrollment recovery, native shared-family storage and live
browser/TLS/Cognito acceptance. Do not invent an OAuth issuer/client or turn a
Dashboard JWT into an API token.

The target uses the same Platform account with separately consented developer
grants, short-lived distinct REST/MCP access tokens and rotating refresh families.
Browser sign-out and developer-session revocation have separate lifecycles.
Those source contracts do not establish an available login command today.

## End-user enrollment and removal

Your application authenticates its own user and maps that identity to its Bota
end-user ID on the server. Bota natively supports secret-key-only
`POST /v1/end-users/{id}/user-token` and `DELETE /v1/end-users/{id}/user-token`,
or Platform **MCP Access**. Do not trust a caller-supplied target ID as proof of
ownership. Issuing a replacement revokes the previous token. Issuance currently
sets no expiry or requested lifetime; this is not your application's login session.

Removing a CLI profile/legacy saved key is local cleanup. It does not revoke a
project key used by other integrations. Revoke that key explicitly in Platform
when intended. Environment secrets remain caller-controlled. Likewise browser
sign-out must not be reported as developer-grant revocation.

References: [authentication](https://docs.bota.dev/authentication),
[user-token contract](https://docs.bota.dev/api-reference/end-users/user-token),
[CLI source](https://github.com/bota-dev/bota-cli/blob/5270781b39ff59f7b889c58a288a59f63f50ca46/README.md),
[API SDK source](https://github.com/bota-dev/api-sdk/tree/3546bc71da16885f664aaa7d057e5baddc0ba13b).
