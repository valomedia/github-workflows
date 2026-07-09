# AGENTS.md – Repository Instructions

## Scope

These instructions apply to the entire repository.

## Reusable Workflow Versioning

Consumers reference reusable workflows and composite actions by Git ref,
for example `valomedia/github-workflows/.github/workflows/scheduled-sftp-release.yml@v1`.

GitHub resolves `@v1` as the literal Git ref named `v1`.
It does not select the newest semver-compatible `v1.x.y` tag automatically.
If a tag and branch have the same name,
the tag takes precedence in reusable workflow references.

Publish immutable patch and minor tags such as `v1.0.0`, `v1.0.1`, and `v1.0.2`
at the commits they release.
Do not move those exact-version tags after publication.

Maintain the moving major tag `v1` for backwards-compatible v1 releases.
Whenever a new backwards-compatible `v1.x.y` release is published,
advance `v1` to the same release commit
so consumers using `@v1` receive the newest compatible v1 workflow.

Consumers should use `@v1`
when they intentionally want the newest backwards-compatible v1 workflow.
Consumers that need exact reproducibility should pin to an immutable `@v1.x.y` tag
or to a full commit SHA.

Do not create a branch named `v1` alongside the `v1` tag.
The tag wins when GitHub resolves reusable workflow references,
so a same-named branch would be misleading and unsafe to rely on.
