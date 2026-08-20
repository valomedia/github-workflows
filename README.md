# valo.media GitHub Workflows

Reusable workflows shared across valo.media repositories.

```yaml
jobs:
  ci:
    uses: valomedia/github-workflows/.github/workflows/node-npm-ci.yml@v1
```

`@v1` is a branch that follows the newest backwards-compatible v1 release.
Pin a `v1.x.y` tag or a commit SHA instead for exact reproducibility.

Inputs are optional unless the table marks them required.
A command input set to an empty string skips its step.
A default marked *Renovate-tracked* is a version Renovate keeps current,
so the workflow file holds the value in effect.

## `node-npm-ci.yml`

`build`, `lint`, `unit-tests`, and `integration-tests`,
each waiting on the one before it.

| Input | Default |
| --- | --- |
| `node-version` | *Renovate-tracked* |
| `build-command` | `npm run build` |
| `lint-command` | `npm run lint` |
| `unit-test-command` | `NODE_ENV=test npm run test` |
| `integration-test-command` | *empty*, and required to run the job |
| `integration-install-command` | *empty* |

## `android-ci.yml`

`build`, `lint`, and `unit-tests` in parallel,
plus `instrumented-tests` on an emulator.
`build` uploads the APK it produced.

| Input | Default |
| --- | --- |
| `runs-on` | `ubuntu-latest` |
| `java-version` | *Renovate-tracked* |
| `java-distribution` | `temurin` |
| `gradle-version` | *empty*, for the Gradle on the runner image |
| `gradle-wrapper-command` | `gradle :wrapper` |
| `build-command` | `./gradlew :app:assembleDebug --stacktrace` |
| `build-artifact-name` | `android-debug-apk` |
| `build-artifact-path` | `app/build/outputs/apk/debug/*.apk` |
| `lint-command` | `./gradlew :app:lintDebug --stacktrace` |
| `unit-test-command` | `./gradlew :app:testDebugUnitTest --stacktrace` |
| `instrumented-test-command` | *empty*, and required to run the job |
| `instrumented-test-api-level` | *Renovate-tracked* |
| `instrumented-test-arch` | `x86_64` |
| `instrumented-test-artifact-name` | `instrumented-test-artifacts` |
| `instrumented-test-artifact-path` | *empty*, for no upload |

## `ios-ci.yml`

`lint`, `build`, `unit-tests`, and `instrumented-tests` in parallel on macOS.
The instrumented tests are the UI tests, named to match the Android workflow.

Every job creates its own simulator
and exports the UDID as `IOS_CI_SIMULATOR_UDID`.
An empty build or test command runs `xcodebuild` against that simulator
for the given workspace and scheme, with code signing off.

| Input | Default |
| --- | --- |
| `workspace` | required |
| `scheme` | required |
| `runs-on` | *Renovate-tracked* |
| `xcode-path` | `/Applications/Xcode.app` |
| `install-command` | `pod install --repo-update` |
| `simulator-name` | `iOS CI iPhone` |
| `simulator-device` | *empty*, for the newest iPhone Pro Max on the runner |
| `lint-command` | `./scripts/lint.sh` |
| `build-command` | *empty* |
| `unit-test-command` | *empty* |
| `unit-test-only-testing` | *empty*, for the whole scheme |
| `instrumented-test-command` | *empty* |
| `instrumented-test-only-testing` | *empty* |

`instrumented-tests` runs when either instrumented input is set.

## `scheduled-sftp-release.yml`

Releases `branch` to an SFTP host, tagged `v<UTC date>.<release-sequence>`.
The caller needs `actions: read` and `contents: write`.

It stops, without failing, when that release already exists,
when nothing landed since the previous release,
or when `ci-workflow` has no successful run for the commit being released.
The mirror deletes remote files the build no longer produces,
except root `.ht*` files such as `.htaccess`.

| Input | Default |
| --- | --- |
| `branch` | `main` |
| `ci-workflow` | `ci.yml` |
| `node-version` | *Renovate-tracked* |
| `build-command` | `npm run build` |
| `dist-path` | `dist` |
| `release-sequence` | `0` |
| `sftp-host` | *empty*, for the `SFTP_HOST` secret |
| `sftp-port` | `22` |
| `sftp-username` | *empty*, for the `SFTP_USERNAME` secret |
| `sftp-remote-path` | *empty*, for the `SFTP_REMOTE_PATH` secret |

Pass `SFTP_PASSWORD` or `SFTP_PRIVATE_KEY` as a secret to authenticate.
