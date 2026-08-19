# AGENTS.md – Repository Instructions

## Scope

These instructions apply to the entire repository.

## Repository Purpose

This private repository contains shared valo.media GitHub Actions automation.

The main reusable workflow is `.github/workflows/scheduled-sftp-release.yml`.
It is called from consumer repositories through `workflow_call`.

Workflow steps are inlined in the workflow files themselves.
Do not extract shared steps into composite actions under `actions/`.
A composite action in this repository has to be referenced by an explicit Git ref,
and those refs go stale as soon as the workflow and the action are released together.
Duplicating a few steps across workflows is cheaper than keeping those refs correct.

Sharing a script file needs no ref:
a called workflow can check out its own repository
at `${{ job.workflow_repository }}` and `${{ job.workflow_sha }}`,
which always resolves to the commit the running workflow came from.
Two limits apply.
`uses:` accepts no expressions, so this does not extend to composite actions,
and `github.token` only reaches the calling repository,
so every consumer needs a token secret while this repository is private.
A one-line step is not worth a checkout; a real script is.

## Validation

There is no package manifest or local test suite in this repository.
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

## Reusable Workflow Versioning

Consumers reference reusable workflows by Git ref,
for example `valomedia/github-workflows/.github/workflows/scheduled-sftp-release.yml@v1`.

GitHub resolves `@v1` as the literal Git ref named `v1`.
It does not select the newest semver-compatible `v1.x.y` tag automatically.
If a tag and branch have the same name,
the tag takes precedence in reusable workflow references.

Publish immutable patch and minor tags such as `v1.0.0`, `v1.0.1`, and `v1.0.2`
at the commits they release.
Do not move those exact-version tags after publication.

Maintain the major version branch `v1` for backwards-compatible v1 releases.
Whenever a new backwards-compatible `v1.x.y` release is published,
advance the `v1` branch to the same release commit
so consumers using `@v1` receive the newest compatible v1 workflow.

Consumers should use `@v1`
when they intentionally want the newest backwards-compatible v1 workflow.
Consumers that need exact reproducibility should pin to an immutable `@v1.x.y` tag
or to a full commit SHA.

Do not create a tag named `v1` alongside the `v1` branch.
The tag wins when GitHub resolves reusable workflow references,
so a same-named tag would hide the branch and leave `@v1` consumers on the tag's commit.

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
optionally after a lowercase label prefix such as the `macos-` in `macos-15`.
Renovate rewrites the value and leaves the annotation alone,
so never write the current version into the annotation text.

Keep runtime versions such as `java-version` major-only.
The setup actions resolve a major as a range
and install the newest matching release the runner offers.

Prefer resolving a value from the runner at run time
over pinning it and tracking it,
as `ios-ci.yml` does for the simulator device.

When Renovate changes a default version,
update the matching version in `README.md` in the same pull request.
