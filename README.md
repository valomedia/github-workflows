# valo.media GitHub Workflows

Private shared GitHub Actions automation for valo.media repositories.

## Node/npm CI

Use `node-npm-ci.yml` from a repository-local wrapper workflow
that owns triggers, concurrency, top-level permissions,
and any repository-specific command overrides.

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  ci:
    uses: valomedia/github-workflows/.github/workflows/node-npm-ci.yml@v1
```

The reusable workflow runs separate `build`, `lint`, `unit-tests`,
and optional `integration-tests` jobs.
Each job checks out the repository,
sets up Node.js with npm caching,
and installs dependencies with `npm ci --include=dev`.

By default it uses Node.js 24 and runs these commands in order:

1. `npm run build`
2. `npm run lint`
3. `NODE_ENV=test npm run test`
4. the integration test command, when supplied

Repositories with Playwright or other browser integration tests
can enable the optional integration job by supplying a test command,
and can run an install step before it:

```yaml
jobs:
  ci:
    uses: valomedia/github-workflows/.github/workflows/node-npm-ci.yml@v1
    with:
      node-version: '24'
      integration-install-command: npx playwright install --with-deps chromium
      integration-test-command: npm run test:integration
```

For repositories that need compatibility overrides,
`build-command`, `lint-command`, and `unit-test-command`
can be set to alternate npm scripts.
Set `build-command` or `lint-command` to an empty string
to leave that job present while skipping the command.

## Android CI

Use `android-ci.yml` from a repository-local wrapper workflow
that owns triggers, concurrency, top-level permissions,
and any repository-specific command overrides.

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  ci:
    uses: valomedia/github-workflows/.github/workflows/android-ci.yml@v1
```

The reusable workflow runs separate `build`, `lint`, `unit-tests`,
and optional `instrumented-tests` jobs on Ubuntu.
Each job checks out the repository,
sets up Java and Gradle,
generates the Gradle wrapper by default,
and then runs the job-specific command.

By default it mirrors JetNews CI by using Java 17,
leaving `gradle-version` empty so the wrapper is generated
with the Gradle on the runner image,
running `gradle :wrapper`,
and using these commands:

1. `./gradlew :app:assembleDebug --stacktrace`
2. `./gradlew :app:lintDebug --stacktrace`
3. `./gradlew :app:testDebugUnitTest --stacktrace`
4. the instrumented test command, when supplied

The build job uploads `app/build/outputs/apk/debug/*.apk`
as `android-debug-apk` by default.
Set `build-artifact-path` to an empty string to skip artifact upload.

Enable the optional instrumented test job by supplying a command.
The job enables KVM and runs the command through
`reactivecircus/android-emulator-runner` with API level 35 and `x86_64`
by default:

```yaml
jobs:
  ci:
    uses: valomedia/github-workflows/.github/workflows/android-ci.yml@v1
    with:
      instrumented-test-command: ./gradlew connectedCheck --stacktrace
```

For repositories that need compatibility overrides,
`gradle-wrapper-command`, `build-command`, `lint-command`,
`unit-test-command`, and `instrumented-test-command`
can be set to alternate commands.
Set `gradle-wrapper-command`, `build-command`, `lint-command`,
or `build-artifact-path` to an empty string to skip that step.

## iOS CI

Use `ios-ci.yml` from a repository-local wrapper workflow
that owns triggers, concurrency, top-level permissions,
and any repository-specific command overrides.

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main
      - master

permissions:
  contents: read

jobs:
  ci:
    uses: valomedia/github-workflows/.github/workflows/ios-ci.yml@v1
    with:
      workspace: Chronos.xcworkspace
      scheme: Pandatrack
      unit-test-only-testing: ChronosTests
```

The reusable workflow runs separate `lint`, `build`, `unit-tests`,
and optional `instrumented-tests` jobs on macOS.
Each job checks out the repository,
selects Xcode,
installs CocoaPods dependencies,
creates an iOS simulator,
and then runs the job-specific command.

By default it selects `/Applications/Xcode.app`,
uses the `macos-15` runner,
installs dependencies with `pod install --repo-update`,
runs `./scripts/lint.sh`,
and uses `xcodebuild` for the configured workspace and scheme.
The default build and test commands disable code signing
and use the per-job simulator through `IOS_CI_SIMULATOR_UDID`.

Enable instrumented tests by supplying either an explicit command
or an `xcodebuild -only-testing` value for the default command:

```yaml
jobs:
  ci:
    uses: valomedia/github-workflows/.github/workflows/ios-ci.yml@v1
    with:
      workspace: Chronos.xcworkspace
      scheme: Pandatrack
      unit-test-only-testing: ChronosTests
      instrumented-test-only-testing: ChronosUITests
```

For repositories that need compatibility overrides,
`install-command`, `lint-command`, `build-command`,
`unit-test-command`, and `instrumented-test-command`
can be set to alternate scripts.
Set `xcode-path`, `install-command`, or `lint-command`
to an empty string to skip that setup or lint step.

## Scheduled SFTP release deployment

Use `scheduled-sftp-release.yml` from a repository-local wrapper workflow
that owns the schedule and repository-specific inputs.

```yaml
jobs:
  deploy:
    uses: valomedia/github-workflows/.github/workflows/scheduled-sftp-release.yml@v1.0.2
    with:
      ci-workflow: ci.yml
      build-command: npm run build
      dist-path: dist
      sftp-host: ${{ vars.SFTP_HOST }}
      sftp-port: ${{ vars.SFTP_PORT || '22' }}
      sftp-username: ${{ vars.SFTP_USERNAME }}
      sftp-remote-path: ${{ vars.SFTP_REMOTE_PATH }}
    secrets: inherit
```

The called repository must provide these GitHub Actions variables or secrets:

- `SFTP_HOST`
- `SFTP_PORT`, optional and defaulting to `22`
- `SFTP_USERNAME`
- `SFTP_REMOTE_PATH`
- `SFTP_PASSWORD` or `SFTP_PRIVATE_KEY`

The reusable workflow checks that the configured CI workflow has succeeded
for the exact `main` commit being released,
builds the configured Vite artifact,
creates the GitHub Release tag at that verified commit,
deploys it to SFTP,
and creates a GitHub Release with GitHub-generated notes.

The SFTP deploy step deletes stale remote app files during sync
and excludes root `.ht*` files such as `.htaccess`
from overwrite and deletion.

## Dependency updates

Renovate keeps the pinned versions in this repository current.
`renovate.json` extends the shared `github>valomedia/renovate-config` preset,
so the update schedule, automerge policy, and labels live there.

Every action reference is pinned to a full commit SHA
with the released version in a trailing comment:

```yaml
- name: Check out repository
  uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

Renovate reads the version from that comment,
so it opens `v7.0.1` to `v7.1.0` pull requests
instead of unlabelled digest bumps,
and it rewrites the SHA and the comment together.
The `helpers:pinGitHubActionDigestsToSemver` preset
pins newly added action references the same way
and keeps moving major tags such as `v7` out of the candidate versions.

Versions that live in `workflow_call` input defaults are not action references,
so no Renovate manager finds them on its own.
They carry an annotation instead,
directly above the `default:` line they describe:

```yaml
node-version:
  description: Node.js version used for build, lint, and test jobs.
  required: false
  type: string
  # renovate: datasource=node-version depName=node versioning=node
  default: '24'
```

The `customManagers` entry in `renovate.json` matches those annotations.
The annotated defaults are:

- `node-version` in `node-npm-ci.yml` and `scheduled-sftp-release.yml`,
  tracked against Node.js LTS releases.
- `java-version` in `android-ci.yml`,
  tracked against Temurin JDK major versions.
- `instrumented-test-api-level` in `android-ci.yml`,
  tracked against Android API levels.
- `runs-on` in `ios-ci.yml`,
  tracked against the GitHub-hosted macOS runner images.

All of them are major-version pins,
and the shared preset sends major updates to the dependency dashboard,
so each one is approved by hand rather than merged automatically.

The runtime versions are major-only on purpose.
`actions/setup-java` and `actions/setup-node` treat `'17'` and `'24'` as ranges
and install the newest matching release the runner offers,
so a major-only default picks up patch releases without a pull request.
An exact build would instead sit frozen until someone merged one,
and would cost a JDK or Node download
whenever it differed from the build cached on the runner image.
Consumers that need an exact build can set the input.

Android API levels have no built-in Renovate datasource,
so `renovate.json` defines the `android-api-level` custom datasource.
It reads the API level that endoflife.date records for each Android release.
Two things are worth checking before approving one of those updates:
whether an emulator system image exists for the new API level,
because a released Android version does not guarantee one,
and whether the newest API level is the right test target at all.
A consumer that tests against its own `targetSdk`
should set `instrumented-test-api-level` rather than take the default.

Some versioned defaults are deliberately left unmanaged:

- `simulator-device` in `ios-ci.yml`.
  The runner's own `xcrun simctl` device list is the only authority
  on which iPhone simulators exist,
  so there is nothing to track it against.
  A stale value degrades rather than fails,
  because the workflow falls back to an available iPhone device type.
- `xcode-path` in `ios-ci.yml` selects `/Applications/Xcode.app`,
  which is the runner image's default Xcode and carries no version.
- `runs-on` in `android-ci.yml` and the `ubuntu-latest` job labels,
  which follow the runner image's own `latest` alias.

Review those by hand when the runner images change.

A merged Renovate pull request reaches consumers only after a release,
because consumers reference these workflows by Git ref.
Publish a new `v1.x.y` tag and advance the `v1` branch as usual.
