# AGENTS.md – Repository Instructions

## Scope

These instructions apply to the entire repository.

## Repository Purpose

This repository contains shared valo.media GitHub Actions automation.
It is public, so a consumer can check it out with the default `GITHUB_TOKEN`.

`README.md` documents the reusable workflows for consumers.
Update it in the same pull request
as any change to a workflow's inputs, jobs, or behaviour.

Shared steps may be extracted into a script or composite action under `actions/`.
A called workflow should check out its own repository
at `${{ job.workflow_repository }}` and `${{ job.workflow_sha }}`,
which always resolves to the commit the running workflow came from,
and an action in that checkout is referenced by workspace path,
as `uses: ./<path>/actions/<name>`.

Place that checkout after the caller's own checkout.
A local action resolves when its step runs,
and `actions/checkout` cleans untracked files out of the directory it checks out,
so a caller checkout that ran second would delete the tools first.
A one-line step is not worth a checkout; a real script or action is.

## Validation

`package.json` lists only the release tooling, and `package-lock.json` pins it;
there is no local test suite.
For documentation-only changes,
validate by inspecting the changed Markdown and relevant workflow YAML.

For workflow changes,
run at least a YAML parse check when available,
and inspect the affected `workflow_call` inputs, secrets, permissions, and action references.
Do not run SFTP deployment commands locally.

For Renovate configuration changes,
validate with `renovate-config-validator`,
and check the result with `RENOVATE_PLATFORM=local renovate --dry-run=lookup`.
That reads Git-tracked files, so stage changes first,
and it cannot resolve `github>valomedia/renovate-config` without a GitHub token.

For release configuration changes,
install the locked release tooling with `npm ci`,
then run `npx semantic-release --dry-run --no-ci --branches <branch>` on a pushed branch.
The GitHub plugin's checks need a `GITHUB_TOKEN`.
Do not drop that plugin with `--plugins` instead:
that also drops the preset, so the dry run analyzes commits differently.

## Reusable Workflow Versioning

`release.yml` runs semantic-release on `main` every Friday at 03:21 UTC.
It derives the version from the Conventional Commits since the last release,
so write every commit message as one.
`fix:` and `perf:` release a patch, `feat:` a minor, and a breaking change a major.
Mark every breaking change with both a `!` after the type and a `BREAKING CHANGE:` footer.
`chore(deps):`, which Renovate writes for a dependency update, releases a patch,
so a security fix in a dependency reaches callers.
`renovate.json` makes that `build(deps):` for the release tooling in `package.json`,
which releases nothing, as callers never run it.
A revert of a single commit, as `git revert` writes it, releases a patch, whatever that commit's type;
a revert of a merge commit releases nothing.
Other types, such as `chore:`, `ci:`, and `docs:`, release nothing on their own.
Renovate never marks an update as breaking;
when one breaks callers, add a commit with both markers to its pull request.
A pull request merged with a merge commit releases what its commits say, not its title.

Each release tags its commit with an immutable version such as `v1.2.1`.
Do not move those exact-version tags after publication.

The same run then fast-forwards the branch of the major it released, such as `v1`,
and creates that branch for a new major,
so consumers using `@v1` receive the newest compatible v1 workflow.
The run never moves the branch of an older major, as releases only come from `main`.
A branch that failed to advance catches up with its major's next release.
If a newer major is released first, fast-forward it to its major's last release by hand,
as `GITHUB_TOKEN` may only point a ref at a commit whose workflows match `main`.

Do not create a tag named `v1` alongside the `v1` branch.
A tag wins over a branch of the same name
when GitHub resolves a reusable workflow reference,
so the tag would hide the branch and leave `@v1` consumers on its commit.

## Dependency Updates

Pin every action reference to a full commit SHA
with the exact release version in a trailing comment,
for example `uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`.
Use the commit the tag resolves to, not the SHA of an annotated tag object,
and never replace a pinned SHA with a floating tag.

Annotate version-bearing `workflow_call` input defaults
directly above the `default:` line they describe:

```yaml
# renovate: datasource=node-version depName=node versioning=node
default: '24'
```

The custom manager in `renovate.json` reads `datasource` and `depName`,
plus optional `packageName`, `versioning`, and `extractVersion`.
The value has to start with a digit,
optionally after a lowercase label prefix,
such as the `macos-` on the iOS runner label.
Renovate rewrites the value and leaves the annotation alone,
so never write the current version into the annotation text.

Pin every runner to an OS version, such as `ubuntu-24.04`,
never a `-latest` label, which moves to a new OS version without a change here.
Renovate's `github-actions` manager tracks a literal `runs-on:` value,
and a `runs-on` input default takes the annotation above.

Keep runtime versions such as `java-version` major-only.
The setup actions resolve a major as a range
and install the newest matching release the runner offers.

Keep `conventional-changelog-conventionalcommits` on major 9 while `semantic-release` is on 25.
Its major 10 renders notes only with `conventional-changelog-writer` 9,
and the release notes plugin of `semantic-release` 25 ships writer 8.
From `semantic-release` 26.0.0-beta.2, its default plugins move to writer 9 and depend on preset 10 themselves,
so the devDependency may go with that upgrade.

Prefer resolving a value from the runner at run time
over pinning it and tracking it,
as `ios-ci.yml` does for the simulator device.
