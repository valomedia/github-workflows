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

## Validation

There is no package manifest or local test suite in this repository.
For documentation-only changes,
validate by inspecting the changed Markdown and relevant workflow YAML.

For workflow changes,
run at least a YAML parse check when available,
and inspect the affected `workflow_call` inputs, secrets, permissions, and action references.
Do not run SFTP deployment commands locally.

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
