# valo.media GitHub Workflows

Reusable workflows shared across valo.media repositories.

## `node-npm-ci.yml`

`build`, `lint`, `unit-tests`, and `integration-tests`,
each waiting on the one before it.

| Input | What it does | Default |
| --- | --- | --- |
| `node-version` | Node.js every job sets up | Newest Node LTS |
| `build-command` | What `build` runs; empty skips it | `npm run build` |
| `lint-command` | What `lint` runs; empty skips it | `npm run lint` |
| `unit-test-command` | What `unit-tests` runs | `NODE_ENV=test npm run test` |
| `integration-test-command` | What `integration-tests` runs | The job does not run |
| `integration-install-command` | Extra install before the integration tests, such as browser downloads | No install step |

## `android-ci.yml`

`build`, `lint`, and `unit-tests` in parallel,
plus `instrumented-tests` on an emulator.
`build` uploads the APK it produced.

| Input | What it does | Default |
| --- | --- | --- |
| `runs-on` | Runner every job takes | `ubuntu-latest` |
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

Pass `SFTP_PASSWORD` or `SFTP_PRIVATE_KEY` as a secret to authenticate.
