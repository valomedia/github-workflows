# valo.media GitHub Workflows

Reusable workflows shared across valo.media repositories.

Each one owns its concurrency group, so a caller needs no `concurrency:` block.
Groups are scoped to the calling repository,
so repositories sharing a workflow never queue behind each other.

Each one runs on a fixed OS version rather than a `-latest` runner label,
so a new OS version reaches callers only through a release of these workflows.

## `node-npm-ci.yml`

`build`, `lint`, `unit-tests`, and `integration-tests`,
each waiting on the one before it.

| Input | What it does | Default |
| --- | --- | --- |
| `node-version` | Node.js every job sets up | Newest Node LTS |
| `build-command` | What `build` runs; empty skips it | `npm run build` |
| `build-artifact-path` | Directory `build` uploads as a `.zip` and a `.tar.gz` artifact; empty skips the upload | Nothing is uploaded |
| `build-artifact-name` | Name both artifacts get, before their extension | `node-build` |
| `lint-command` | What `lint` runs; empty skips it | `npm run lint` |
| `unit-test-command` | What `unit-tests` runs | `NODE_ENV=test npm run test` |
| `integration-test-command` | What `integration-tests` runs | The job does not run |
| `integration-install-command` | Extra install before the integration tests, such as browser downloads | No install step |
| `concurrency-group` | Group this call joins; name one where two of your workflows call this on the same ref, or they cancel each other | This workflow and the caller's ref |
| `concurrency-cancel-in-progress` | Whether joining cancels the run it supersedes | `true` |

`build-artifact-path` is relative to the caller's repository
and has to be a directory inside it, not the repository root.
Each archive holds that directory under its own name,
so `dist/index.html` extracts to `dist/index.html`,
with hidden files, empty directories, and symlinks as they are.
Each archive is its own artifact, uploaded without the usual ZIP wrapper
and named `<build-artifact-name>.zip` or `<build-artifact-name>.tar.gz`,
so the name may only contain letters, digits, dots, underscores, and hyphens.
Download one with `actions/download-artifact` v8 or newer,
passing that full name,
and `skip-decompress: true` to keep the ZIP from being extracted.
When several calls in one run upload, such as a matrix,
give each its own `build-artifact-name`.

## `node-npm-cd.yml`

Creates a GitHub release from the exact `main` commit that triggered the caller.
Call it from a scheduled or manually dispatched workflow;
other events and branches fail rather than silently skipping.
The caller needs `actions: read` and `contents: write`.
No additional secret or npm publishing token is required.

The latest run of `ci-workflow` for that SHA on `main` must have completed successfully.
Missing, pending, failed, cancelled, or inaccessible CI fails CD before installation or build.
It does not wait for CI, so schedule CD after your normal CI window,
or dispatch it once CI has finished.
Then it installs dependencies with `npm ci --include=dev`,
runs optional E2E tests, preserves optional screenshots, builds, and releases.
An E2E failure prevents the build and release.

| Input | What it does | Default |
| --- | --- | --- |
| `ci-workflow` | Caller CI workflow filename or ID whose latest run gates the release | `ci.yml` |
| `node-version` | Node.js used for E2E tests and the build | Newest Node LTS |
| `build-command` | Produces the release build; must not be empty | `npm run build` |
| `build-artifact-path` | Directory containing the build output | `dist` |
| `e2e-test-command` | E2E test command; empty skips E2E | No E2E tests |
| `e2e-install-command` | Extra install before enabled E2E tests, such as browser downloads | No install step |
| `e2e-screenshots-path` | Directory of screenshots to include; requires `e2e-test-command` | No screenshots |
| `concurrency-group` | Group this call joins; empty derives one | This workflow and `main` |

Both path inputs select directories inside the caller's repository, not its root,
Git metadata, or the reserved `.node-npm-cd-tools` checkout.
A configured directory that does not exist fails the release.
Each release has two assets, `<repository>-<version>.zip` and `<repository>-<version>.tar.gz`,
for example `froobnicator-1.2.3.zip` and `froobnicator-1.2.3.tar.gz`.
Both contain the build output under `build/`
and optional screenshots under `screenshots/`.
They preserve hidden files, empty directories, and symlinks without following the links.
Screenshots are copied before the build so build cleanup cannot remove them from the release.
Only select output intended for publication, including any hidden files and screenshots.

The workflow uses its own locked semantic-release tooling and release runtime,
not the caller's release dependencies or configuration.
Conventional Commits determine the next version and release notes:
`fix:` and `perf:` produce patches, `feat:` a minor, and breaking changes a major.
Tags use `v<version>`; the caller's `package.json` version is not used or changed.
It publishes on GitHub only, not npm, and does not comment on or label issues or PRs.
No release-worthy commits is a successful no-op after the CI, E2E, and build checks,
provided the last stable tag selected by semantic-release has a published GitHub release
with both completed archive assets (or no previous release tag exists).
A tag alone is not proof of publication:
semantic-release pushes it before creating the release and uploading assets.
If a retry finds a missing release, an unpublished draft, or incomplete assets,
it fails with recovery guidance instead of reporting success.
Inspect the original run, restore the correct release notes and both archives
from that tagged commit, and finish publication manually before retrying.
Preserve the tag and do not upload a later `main` build under an older version.
This check also applies to an existing release tag when first adopting the workflow.
API lookup failures must be resolved before the no-op can be verified.
If the run is already behind `main` when publication starts,
it fails rather than switching to an unverified commit;
start another run after CI passes for the new SHA.
Concurrency protects an active release from cancellation.
GitHub keeps at most one pending run, replacing it when a newer invocation arrives.
`scheduled-sftp-release.yml` remains available separately; this workflow does not deploy to SFTP.

Example caller, stored in the consuming repository's `.github/workflows/cd.yml`:

```yaml
name: CD
on:
  schedule:
    - cron: '21 3 * * 5'
  workflow_dispatch:

permissions:
  actions: read
  contents: write

jobs:
  release:
    # Replace <full-commit-sha> with the commit of a released workflow version.
    uses: valomedia/github-workflows/.github/workflows/node-npm-cd.yml@<full-commit-sha>
    with:
      ci-workflow: ci.yml
      build-artifact-path: dist
      e2e-install-command: npx playwright install --with-deps
      e2e-test-command: npm run test:e2e
      e2e-screenshots-path: test-results/screenshots
```

The repository's default branch must be `main` for the scheduled invocation.
For a manual invocation, select `main` in the dispatch dialog.
Omit the three `e2e-*` inputs when E2E is not needed.

## `android-ci.yml`

`build`, `lint`, and `unit-tests` in parallel,
plus `instrumented-tests` on an emulator.
`build` uploads the APK it produced.

| Input | What it does | Default |
| --- | --- | --- |
| `runs-on` | Runner every job takes | Newest Ubuntu runner |
| `java-version` | JDK every job sets up | Newest Java release |
| `java-distribution` | Vendor that JDK comes from | `temurin` |
| `gradle-version` | Gradle installed before the wrapper is generated | The runner image's Gradle |
| `gradle-wrapper-command` | Generates the wrapper every job then uses; empty keeps a checked-in one | `gradle :wrapper` |
| `build-command` | What `build` runs; empty skips it | `./gradlew :app:assembleDebug --stacktrace` |
| `build-artifact-path` | What `build` uploads; empty skips the upload | `app/build/outputs/apk/debug/*.apk` |
| `build-artifact-name` | Name that upload gets | `android-debug-apk` |
| `lint-command` | What `lint` runs; empty skips it | `./gradlew :app:lintDebug --stacktrace` |
| `unit-test-command` | What `unit-tests` runs | `./gradlew :app:testDebugUnitTest --stacktrace` |
| `instrumented-test-command` | What the emulator runs | The job does not run |
| `instrumented-test-api-level` | Android version the emulator boots | Newest Android API level |
| `instrumented-test-arch` | ABI the emulator runs | `x86_64` |
| `instrumented-test-artifact-path` | What `instrumented-tests` uploads, pass or fail | Nothing is uploaded |
| `instrumented-test-artifact-name` | Name that upload gets | `instrumented-test-artifacts` |
| `concurrency-group` | Group this call joins; name one where two of your workflows call this on the same ref, or they cancel each other | This workflow and the caller's ref |
| `concurrency-cancel-in-progress` | Whether joining cancels the run it supersedes | `true` |

## `ios-ci.yml`

`lint`, `build`, `unit-tests`, and `instrumented-tests` in parallel on macOS.
The instrumented tests are the UI tests, named to match the Android workflow,
and run only when one of the two instrumented inputs is set.

Every job creates its own simulator
and exports the UDID as `IOS_CI_SIMULATOR_UDID`.
The default build and test commands drive `xcodebuild` against that simulator,
with code signing off.

| Input | What it does | Default |
| --- | --- | --- |
| `workspace` | Workspace the default commands act on | required |
| `scheme` | Scheme they build and test | required |
| `runs-on` | Runner every job takes | Newest macOS runner |
| `xcode-path` | Xcode every job selects; empty keeps the runner's choice | `/Applications/Xcode.app` |
| `install-command` | Dependency install every job runs; empty skips it | `pod install --repo-update` |
| `simulator-device` | Device type each job simulates | Newest iPhone Pro Max on the runner |
| `simulator-name` | Name that simulator gets | `iOS CI iPhone` |
| `lint-command` | What `lint` runs; empty skips it | `./scripts/lint.sh` |
| `build-command` | What `build` runs | `xcodebuild build` |
| `unit-test-command` | What `unit-tests` runs | `xcodebuild test` |
| `unit-test-only-testing` | `-only-testing` target for that default | The whole scheme |
| `instrumented-test-command` | What `instrumented-tests` runs | `xcodebuild test` |
| `instrumented-test-only-testing` | `-only-testing` target for that default | The whole scheme |
| `concurrency-group` | Group this call joins; name one where two of your workflows call this on the same ref, or they cancel each other | This workflow and the caller's ref |
| `concurrency-cancel-in-progress` | Whether joining cancels the run it supersedes | `true` |

## `scheduled-sftp-release.yml`

Releases `branch` to an SFTP host, tagged `v<UTC date>.<release-sequence>`.
The caller needs `actions: read` and `contents: write`.

It stops, without failing, when that release already exists,
when nothing landed since the previous release,
or when `ci-workflow` has no successful run for the commit being released.
The mirror deletes remote files the build no longer produces,
except root `.ht*` files such as `.htaccess`.

| Input | What it does | Default |
| --- | --- | --- |
| `branch` | Branch the release is cut from | `main` |
| `ci-workflow` | Workflow whose success gates the release | `ci.yml` |
| `node-version` | Node.js the build runs on | Newest Node LTS |
| `build-command` | Produces the directory to upload | `npm run build` |
| `dist-path` | Directory the mirror uploads | `dist` |
| `release-sequence` | Tells apart releases cut on the same UTC day | `0`, that day's first release |
| `sftp-host` | Host to deploy to | The `SFTP_HOST` secret |
| `sftp-port` | Port to reach it on | `22` |
| `sftp-username` | User to log in as | The `SFTP_USERNAME` secret |
| `sftp-remote-path` | Directory on the host to mirror into | The `SFTP_REMOTE_PATH` secret |
| `concurrency-group` | Group this call joins; empty derives one | This workflow and `branch` |
| `concurrency-cancel-in-progress` | Whether joining cancels the release it supersedes | `false`, so releases queue |

Pass `SFTP_PASSWORD` or `SFTP_PRIVATE_KEY` as a secret to authenticate.
