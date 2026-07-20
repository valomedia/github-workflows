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
installing Gradle 9.2.1,
running `gradle wrapper --no-daemon`,
and using these commands:

1. `./gradlew :app:assembleDebug --no-daemon --stacktrace`
2. `./gradlew :app:lintDebug --no-daemon --stacktrace`
3. `./gradlew :app:testDebugUnitTest --no-daemon --stacktrace`
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
      instrumented-test-command: ./gradlew connectedCheck --no-daemon --stacktrace
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

The SFTP deploy action deletes stale remote app files during sync
and excludes root `.ht*` files such as `.htaccess`
from overwrite and deletion.

## Scheduled Azure Functions release deployment

Use `scheduled-azure-release.yml` from a repository-local wrapper workflow
that owns the schedule and repository-specific inputs.
It mirrors the scheduled SFTP release workflow
(calendar tag gating, verification that CI succeeded for the release commit,
build, deploy, and a generated GitHub Release)
but publishes an Azure Functions app instead of syncing to SFTP.

```yaml
name: CD

on:
  schedule:
    - cron: '37 3 * * 5'
  workflow_dispatch:

permissions:
  actions: read
  contents: write
  id-token: write

jobs:
  deploy:
    uses: valomedia/github-workflows/.github/workflows/scheduled-azure-release.yml@v1
    with:
      ci-workflow: ci.yml
      build-command: npm run build
      functionapp-name: my-function-app
      resource-group: ${{ vars.AZURE_RESOURCE_GROUP }}
      azure-client-id: ${{ vars.AZURE_CLIENT_ID }}
      azure-tenant-id: ${{ vars.AZURE_TENANT_ID }}
      azure-subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
      app-settings: |
        SOME_SETTING=${{ vars.SOME_SETTING }}
      config-file-1-path: data/config/example.json
      config-file-1-content: ${{ vars.EXAMPLE_JSON }}
    secrets:
      client-secret: ${{ secrets.CLIENT_SECRET }}
```

Authentication to Azure uses OpenID Connect (workload identity federation)
through `azure/login`, so the caller job must grant `id-token: write`
and the consumer never stores a long-lived Azure deployment secret.
The `azure-client-id`, `azure-tenant-id`, and `azure-subscription-id` inputs
identify an Entra application that has a federated credential for the
consumer repository and RBAC (for example Contributor) on the Function App.

Before deployment the workflow optionally:

- writes up to two configuration files
  (`config-file-*-path` / `config-file-*-content`)
  into the checked-out tree so they are included in the published package, and
- applies Function App application settings from the `app-settings` input
  (one `KEY=VALUE` per line) plus the `client-secret` secret
  (stored under `client-secret-setting-name`, default `CLIENT_SECRET`),
  when `resource-group` is provided.

Deployment builds the app, installs Azure Functions Core Tools,
prunes development dependencies,
and runs `func azure functionapp publish` against `functionapp-name`.
