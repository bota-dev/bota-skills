# Bota Skills

Customer integration recipes for AI assistants using the [Bota API](https://docs.bota.dev).

The ten recipes are **source-reviewed** against the pinned contracts in their
references. The catalog records each guide's content digest and qualification
boundary. Source review and synthetic checks do not certify live deployment,
physical devices, package publication or your application's persistence/security.

This repository contains customer integration recipes. The internal Bota engineering plugin, also named `bota-skills`, is maintained separately. Reading or installing a recipe grants no execution authority.

The customer recipes and their release tooling use the [MIT license](LICENSE).
The backend and internal engineering plugin remain separate private projects.
`release.json` selects **0.1.0-beta.0** as the first source candidate; no tagged
customer-skills bundle has been published yet. Merging this source does not
publish a release or prove an installed assistant or live integration works.

## Current references and coverage

- [API reference](https://docs.bota.dev/api-reference/introduction)
- [API SDK source and supported cohort](https://github.com/bota-dev/api-sdk), including candidate release status
- [CLI guide](https://docs.bota.dev/cli), including published versus source-preview behavior
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

### Install a published bundle

Releases contain ten namespaced `skills/bota-*/SKILL.md` directories following
the [Agent Skills format](https://agentskills.io/specification), with YAML
`name`/`description`, per-skill MIT licenses and the webhook example. The source
recipes keep their existing lowercase `skill.md` paths; the deterministic build
adds installation metadata and rewrites their relative links. This is a skills
bundle, not a CLI or MCP server installer.

After a version is actually published, choose its exact tag from the
[customer releases](https://github.com/bota-dev/bota-skills/releases), download
`bota-skills-VERSION.tar.gz`, `release-manifest.json` and `SHA256SUMS`, and obtain
the expected archive SHA-256 from that trusted release. Hashes alone do not
authenticate an untrusted download source. Clone the same published tag for the
credential-free installer, inspect its source, then run with Node 22.23.2 or
24.19.0 (replace all placeholders):

```bash
git clone --branch vVERSION --depth 1 https://github.com/bota-dev/bota-skills.git bota-skills-source
mkdir -p .claude
node bota-skills-source/scripts/install-release.mjs \
  --archive /path/to/bota-skills-VERSION.tar.gz \
  --sha256 EXPECTED_ARCHIVE_SHA256 \
  --destination .claude/skills
```

The destination must be new and its parent must already exist. The installer
verifies the archive, exact file inventory, source-guide digests, metadata and
cross-links before writing any skill. It performs no network calls or lifecycle
hooks, executes no recipe and refuses an occupied destination. If you already
have skills, install into a fresh staging directory, review the ten `bota-*`
directories, and copy them without overwriting existing names. Keep all ten
together so their links resolve.

Claude Code discovers project skills in `.claude/skills/` and personal skills in
`~/.claude/skills/`; follow its [current installation and invocation guide](https://code.claude.com/docs/en/skills).
After restarting/reloading your client as its guide requires, verify it lists
`bota-recording-upload` and inspect that skill before an authorized integration
task. Other clients that support Agent Skills can use the same directories in
their documented discovery location. This repository does not claim a live
installation test for each client. Cursor or another LLM can still use a recipe
as ordinary Markdown context as shown below.

### As Markdown context in Claude Code or Cursor

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
integrity refusal, deterministic release archives, clean-directory installation,
release-authority refusal and the executable webhook verifier. Application-owned durable
queues/provisioning/upload policy, full SDK/CLI client scenarios, real services
and physical-device acceptance remain separate verification work. To also
reconstruct the recorded operations from the exact source OpenAPI bytes, use
`node scripts/check-catalog.mjs --openapi /path/to/pinned-openapi.json`.
The standalone CI checks the recorded inventory's digest; it does not fetch
or independently regenerate a private upstream contract.

### Maintainer release process

The bundle release version in `release.json` is independent of the `index.json`
catalog schema version (currently 1.1.0). Update the bundle version through a
normal reviewed PR when publishing a new cohort. Source changes must pass Guide
contracts on both pinned Node versions and the repository's required review and
security checks. Merge, repository visibility, package publication and live
service acceptance remain separate events.

Before the first release, a repository administrator must enable
[GitHub immutable releases](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes),
configure the `customer-skills-release` environment with an owner reviewer and
tag-only `v*` deployment policy, prevent administrator bypass where supported, and
protect `v*` tags from update/deletion. Set the non-secret variable
`CUSTOMER_SKILLS_IMMUTABLE_RELEASES=enabled` only after checking that setting.
GitHub's immutability setting needs administration access; the contents-only
workflow does not request that authority or change repository settings.

Normal independent PR source review remains required; the owner who creates
the tag must still be able to approve that release environment. Automation never
acts as the owner reviewer. For each release, the owner records the exact reviewed main commit and version
as `CUSTOMER_SKILLS_RELEASE_APPROVAL=FULL_40_HEX_COMMIT:vVERSION`, creates the
matching tag at that commit, and reviews that source/run in the protected
environment. The tag workflow qualifies both Node pins, then rebuilds the clean
checkout with only the scoped workflow `GITHUB_TOKEN`. It requires the intended
public customer repository, approved source/tag equality and main ancestry;
creates one draft; uploads the archive, manifest and `SHA256SUMS`; reads their
bytes back; then publishes and verifies the release is immutable and all three
assets are publicly readable and byte-identical. Preview versions are marked
prerelease and never promoted to GitHub's latest stable release automatically.

No personal access token, registry account, unversioned download or moving tag
is required. An occupied release/draft or workflow rerun is refused. After an
interruption or unknown write outcome, inspect the original run and exact
release; do not replay, overwrite, adopt or automatically delete partial state.
Resolve it through a reviewed follow-up/new version. The initial candidate's
publication and actual client discovery are still unverified.

The release manifest binds source commit, generator digest, catalog/schema
version, pinned contract digest, original guide digests and every bundled file.
A clean local source checkout can reproduce the candidate without publication:

```bash
node scripts/build-release.mjs --output /path/to/new-output-directory
```

## About Bota

Bota is a **B2B2C platform** — you are the developer integrating the API; your end users wear the devices and never interact with Bota directly. Your backend calls the Bota API on behalf of your end users.

- [Full API reference](https://docs.bota.dev)
- [llms-full.txt](https://docs.bota.dev/llms-full.txt) — single-document comprehensive reference for AI agents
- [API Introduction](https://docs.bota.dev/api-reference/introduction)

## Security scanning

The `Semgrep` workflow runs the `Scan` check for every pull request, including
drafts, forks and changes to any target branch or file path, and for merge-queue
candidates. It uses the pinned community scanner with read-only repository
permissions and requires no scanner account or cloud token. Scanner errors and
findings fail the check.

Manual dispatch accepts an optional full 40-character commit `revision` for a
retrospective scan. The 90-day scan artifact records the exact scanned source,
workflow revision, scanner version, rule snapshots, findings and coverage. A
retrospective result records the new scan date; it does not establish testing
before the original merge.
