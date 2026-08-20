# AGENTS.md – Repository Instructions

## Scope

These instructions apply to the entire repository.

## Repository Purpose

This repository contains shared valo.media GitHub Actions automation.
It is public, so a consumer can check it out with the default `GITHUB_TOKEN`.

`README.md` documents the reusable workflows for consumers.
Update it in the same pull request
as any change to a workflow's inputs, jobs, or behaviour.

Shared steps may be inlined in the workflow files
or extracted into a script or composite action under `actions/`.
Neither needs a Git ref that goes stale.
A called workflow can check out its own repository
at `${{ job.workflow_repository }}` and `${{ job.workflow_sha }}`,
which always resolves to the commit the running workflow came from,
and an action in that checkout is referenced by workspace path,
as `uses: ./<path>/actions/<name>`,
which is a literal and so needs none of the expressions `uses:` forbids.

Place that checkout after the caller's own checkout.
A local action resolves when its step runs,
and `actions/checkout` cleans untracked files out of the directory it checks out,
so a caller checkout that ran second would delete the tools first.
A one-line step is not worth a checkout; a real script or action is.

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

Publish immutable patch and minor tags such as `v1.0.0`, `v1.0.1`, and `v1.0.2`
at the commits they release.
Do not move those exact-version tags after publication.

Maintain the major version branch `v1` for backwards-compatible v1 releases.
Whenever a new backwards-compatible `v1.x.y` release is published,
advance the `v1` branch to the same release commit
so consumers using `@v1` receive the newest compatible v1 workflow.

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

Do not restate those versions in `README.md`.
It marks such a default as Renovate-tracked and leaves the value here,
so a bump leaves no stale documentation behind.

Keep runtime versions such as `java-version` major-only.
The setup actions resolve a major as a range
and install the newest matching release the runner offers.

Prefer resolving a value from the runner at run time
over pinning it and tracking it,
as `ios-ci.yml` does for the simulator device.
