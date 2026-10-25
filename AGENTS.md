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

`package.json` pins only the release tooling; there is no local test suite.
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
run `npx semantic-release --dry-run --no-ci --branches <branch>` on a pushed branch.
The GitHub plugin's checks need a `GITHUB_TOKEN`.
Do not drop that plugin with `--plugins` instead:
that also drops the preset, so the dry run analyzes commits differently.

## Reusable Workflow Versioning

`release.yml` runs semantic-release on `main` every Friday at 03:21 UTC.
It derives the version from the Conventional Commits since the last release,
so write every commit message as one.
`fix:` and `perf:` release a patch, `feat:` a minor, and a breaking change a major.
Mark every breaking change with both a `!` after the type and a `BREAKING CHANGE:` footer.
Types such as `chore:`, `ci:`, and `docs:` release nothing on their own.
A pull request merged with a merge commit releases what its commits say, not its title.

Each release tags its commit with an immutable version such as `v1.2.1`.
Do not move those exact-version tags after publication.

The same run then fast-forwards each major version branch, such as `v1`,
to the newest release of that major, and creates the branch for a new major,
so consumers using `@v1` receive the newest compatible v1 workflow.
`GITHUB_TOKEN` may only point a ref at a commit whose workflows match `main`,
so once `main` has changed a workflow, a branch left behind has to be advanced by hand.

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

Take a new major of `conventional-changelog-conventionalcommits` only after a release dry run.
A major can need a newer changelog writer than semantic-release ships,
as `10.x` does over `semantic-release@25.0.9`.

Prefer resolving a value from the runner at run time
over pinning it and tracking it,
as `ios-ci.yml` does for the simulator device.
