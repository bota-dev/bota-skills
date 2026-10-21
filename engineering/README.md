# Bota engineering harness

This directory is the source of shared internal coding instructions, skills and consistency tooling. Existing API integration guides at the repository root keep their own purpose and catalog.

The first consumer is `bota-dev/bota-cli`. Each consumer has a full source commit in `harness.lock.json`, generated `AGENTS.md`, shared skills in `.agents/skills/`, and its own editable `.bota-harness/repo.md`. Python 3.11+ and Git are required for installation and updates; the offline consistency check uses Python's standard library.

## Install in another repository

Clone this private repository through your normal Git authentication. Start in a clean consumer branch. Existing root `AGENTS.md` guidance is preserved as `.bota-harness/repo.md`; if both files already exist, reconcile them before installing.

```bash
python3 ../bota-skills/engineering/bundle/harness.py init --repo . --source ../bota-skills --ref main
python3 scripts/bota-harness.py check --repo . --source ../bota-skills
```

Inspect `.bota-harness/repo.md`, record the real setup/build/test commands and release requirements, then run:

```bash
python3 scripts/bota-harness.py render --repo .
python3 scripts/bota-harness.py check --repo .
```

Commit the generated files, lock, local guidance and workflows together in a PR. Start a new agent session after updating repository instructions. Agents automatically discover `AGENTS.md` and the installed skills; the sync script is a Bota convention.

## Maintain instructions and skills

- Change common rules in `engineering/bundle/rules.md`.
- Change shared skills in `engineering/bundle/skills/`. Keep skill names distinct; use a separate skill for repository-specific behavior.
- Change local repository guidance in `.bota-harness/repo.md`, then run `render`.
- Preserve shared files as generated outputs. The tool refuses to overwrite modified shared files or existing local skills and files.
- Put enforceable acceptance rules in the repository's tests and CI. Have the repository owner review any local guidance that conflicts with company rules; text composition alone cannot enforce semantic agreement.

Use `$bota-code-change` for a scoped implementation and `$bota-review-change` for a requested review. Both workflows use each repository's own tests and acceptance criteria.

## Update a consumer

After a reviewed central change is merged, fetch the source checkout and resolve the desired ref. Prefer an exact reviewed commit when rolling out a specific version.

```bash
git -C ../bota-skills fetch origin main
python3 ../bota-skills/engineering/bundle/harness.py sync --repo . --source ../bota-skills --ref origin/main
python3 scripts/bota-harness.py check --repo . --source ../bota-skills
```

The tool reads committed source files, so uncommitted edits in the source checkout cannot leak into a consumer. It records a full SHA and hashes every managed file, including the tool and workflows. Review source-pin changes like dependency updates. Keep the pinned source commit reachable through the central repository's merged history; when a source PR is squash-merged, refresh the consumer pin to the resulting main commit before merging the consumer PR.

`check` runs without network or source credentials. It checks the installed snapshot against its lock and regenerates expected instructions from common and local guidance in memory. `check --source PATH` additionally compares every installed file with the actual pinned Git commit. Offline integrity checks do not establish that an edited lock was approved upstream; review lock changes and use the upstream comparison during updates.

## Automatic update PRs

The installed `Update Bota harness` workflow checks the source repository's approved `main` and opens a branch/PR; it never merges or publishes an application. It only stages managed harness paths. An existing PR for the same source commit is reused by leaving it for review.

To activate it in a consumer repository:

1. Set the Actions secret `BOTA_HARNESS_READ_TOKEN` to a fine-grained token with **contents:read** access to this private source repository. Keep it in Actions secrets.
2. Allow GitHub Actions to create pull requests in the consumer's Actions settings. Its normal `GITHUB_TOKEN` writes only the consumer branch and PR.
3. Set the Actions variable `BOTA_HARNESS_AUTO_UPDATE=true` for the weekly Monday 16:17 UTC check, or run the workflow manually.

PRs opened or updated with `GITHUB_TOKEN` can require a maintainer to select **Approve workflows to run** in the PR before CI starts; pushes with that token do not trigger ordinary push workflows. See [GitHub token event behavior](https://docs.github.com/en/actions/concepts/security/github_token). For unattended CI or updates to workflow files, configure the optional `BOTA_HARNESS_WRITE_TOKEN` as an organization bot/App credential with the required consumer-repository permissions, including workflow-file updates. Its repository scope should stay limited to the consumer. The default writer remains the consumer `GITHUB_TOKEN`.

The schedule remains inactive until the variable is enabled. Local installation and ordinary consistency CI need no cross-repository token. In branch protection or a ruleset, require the `Bota harness / consistency` check before merging if you want GitHub to enforce it.

## Validate the source

```bash
python3 -m unittest discover -s engineering/tests -v
```

The tests exercise migration of existing instructions, exact source pins, updates, local guidance, duplicate/collision handling and refusal to clobber modified or symlinked files. They operate on disposable Git repositories and synthetic data.
