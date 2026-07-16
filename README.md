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

The SFTP deploy action deletes stale remote app files during sync
and excludes root `.ht*` files such as `.htaccess`
from overwrite and deletion.
