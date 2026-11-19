import assert from 'node:assert/strict';
import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertPublishedRelease, assertReleaseCommit, release, releaseOptions } from './release.mts';

const archiveScript = fileURLToPath(new URL('./archive.sh', import.meta.url));
const require = createRequire(import.meta.url);

interface Fixture {
  root: string;
  workspace: string;
  archive(phase: string, values: Record<string, string>): SpawnSyncReturns<string>;
  snapshot(screenshots?: string): string;
}

function fixture(t: TestContext): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'node-npm-cd-test-'));
  t.after(function () { rmSync(root, { recursive: true, force: true }); });
  const workspace = join(root, 'project');
  const runnerTemp = join(root, 'temp');
  mkdirSync(workspace);
  mkdirSync(runnerTemp);
  const output = join(root, 'output');
  const env = { ...process.env, GITHUB_WORKSPACE: workspace, RUNNER_TEMP: runnerTemp, GITHUB_OUTPUT: output };

  function archive(phase: string, values: Record<string, string>) {
    return spawnSync('bash', [archiveScript, phase], { cwd: workspace, env: { ...env, ...values }, encoding: 'utf8' });
  }
  function snapshot(screenshots = ''): string {
    const result = archive('screenshots', { SCREENSHOTS_PATH: screenshots });
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(output, 'utf8').trim().split('\n').at(-1)!.slice('directory='.length);
  }
  return { root, workspace, archive, snapshot };
}

function file(directory: string, path: string, contents = path): void {
  const target = join(directory, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function publishedRelease() {
  return {
    tag_name: 'v1.0.0',
    draft: false,
    prerelease: false,
    published_at: '2026-01-01T00:00:00Z',
    assets: ['zip', 'tar.gz'].map(function (extension) {
      return { name: `froobnicator-1.0.0.${extension}`, state: 'uploaded', size: 100 };
    }),
  };
}

function releaseFixture(t: TestContext) {
  const f = fixture(t);
  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: f.workspace, encoding: 'utf8' }).trim();
  }
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('commit', '--quiet', '--allow-empty', '-m', 'feat: initial release');
  file(f.root, 'build.zip');
  file(f.root, 'build.tar.gz');
  const bin = join(f.root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), `#!/bin/sh
printf '%s\\n' "$*" >> "$MOCK_GH_CALLS"
case "$2" in
  repos/\\{owner\\}/\\{repo\\}/git/ref/heads/main) printf '%s\\n' "$GITHUB_SHA" ;;
  repos/owner/froobnicator/releases/tags/*)
    printf '%s\\n' "$MOCK_RELEASE"
    exit "$MOCK_RELEASE_STATUS" ;;
  *) exit 2 ;;
esac
`, { mode: 0o755 });
  const originalEnv = { ...process.env };
  const originalDirectory = process.cwd();
  t.after(function () {
    process.env = originalEnv;
    process.chdir(originalDirectory);
  });
  Object.assign(process.env, {
    PATH: `${bin}:${process.env.PATH}`,
    GITHUB_WORKSPACE: f.workspace,
    GITHUB_SHA: git('rev-parse', 'HEAD'),
    GITHUB_REPOSITORY: 'owner/froobnicator',
    GITHUB_SERVER_URL: 'https://github.com',
    RELEASE_FILES: f.root,
    MOCK_GH_CALLS: join(f.root, 'gh-calls'),
    MOCK_RELEASE: JSON.stringify(publishedRelease()),
    MOCK_RELEASE_STATUS: '0',
  });
  process.chdir(f.workspace);
  return { ...f, git };
}

function archiveEntries(command: string, args: string[]): string[] {
  return execFileSync(command, args, { encoding: 'utf8' }).trim().split('\n')
    .map(function (entry) { return entry.replace(/^\.\//, ''); })
    .filter(Boolean).sort();
}

test('both archives preserve build files, dotfiles, empty directories, and symlinks', function (t) {
  const f = fixture(t);
  file(f.workspace, 'output with spaces/index.html', 'release build');
  file(f.workspace, 'output with spaces/.hidden');
  mkdirSync(join(f.workspace, 'output with spaces/empty'));
  symlinkSync('index.html', join(f.workspace, 'output with spaces/link'));
  const directory = f.snapshot();
  const result = f.archive('build', { BUILD_ARTIFACT_PATH: 'output with spaces', RELEASE_FILES: directory });
  assert.equal(result.status, 0, result.stderr);
  const zip = join(directory, 'build.zip');
  const tar = join(directory, 'build.tar.gz');
  const expected = ['build/', 'build/.hidden', 'build/empty/', 'build/index.html', 'build/link'];
  assert.deepEqual(archiveEntries('unzip', ['-Z1', zip]), expected);
  assert.deepEqual(archiveEntries('tar', ['-tzf', tar]), expected);
  assert.equal(execFileSync('unzip', ['-p', zip, 'build/index.html'], { encoding: 'utf8' }), 'release build');
  assert.equal(execFileSync('unzip', ['-p', zip, 'build/link'], { encoding: 'utf8' }), 'index.html');
  assert.match(execFileSync('tar', ['-tvzf', tar], { encoding: 'utf8' }), /build\/link -> index.html/);
});

test('screenshots survive a build that removes their original directory', function (t) {
  const f = fixture(t);
  file(f.workspace, 'dist/screenshots/home.png', 'screenshot');
  const directory = f.snapshot('dist/screenshots');
  rmSync(join(f.workspace, 'dist'), { recursive: true });
  file(f.workspace, 'dist/index.html', 'new build');
  const result = f.archive('build', { BUILD_ARTIFACT_PATH: 'dist', RELEASE_FILES: directory });
  assert.equal(result.status, 0, result.stderr);
  const expected = ['build/', 'build/index.html', 'screenshots/', 'screenshots/home.png'];
  assert.deepEqual(archiveEntries('unzip', ['-Z1', join(directory, 'build.zip')]), expected);
  assert.deepEqual(archiveEntries('tar', ['-tzf', join(directory, 'build.tar.gz')]), expected);
  assert.equal(execFileSync('unzip', ['-p', join(directory, 'build.zip'), 'screenshots/home.png'], { encoding: 'utf8' }), 'screenshot');
});

test('unsafe or missing archive sources fail instead of publishing the repository', function (t) {
  const f = fixture(t);
  mkdirSync(join(f.workspace, '.git'));
  file(f.workspace, '.node-npm-cd-tools/package.json');
  file(f.workspace, 'nested/.git/config');
  symlinkSync(f.root, join(f.workspace, 'outside-link'));
  for (const path of ['', '.', '..', 'missing', '.git', 'nested', '.node-npm-cd-tools', 'outside-link']) {
    const directory = f.snapshot();
    const result = f.archive('build', { BUILD_ARTIFACT_PATH: path, RELEASE_FILES: directory });
    assert.notEqual(result.status, 0, `Accepted unsafe source ${JSON.stringify(path)}`);
  }
  const missingScreenshots = f.archive('screenshots', { SCREENSHOTS_PATH: 'missing' });
  assert.notEqual(missingScreenshots.status, 0);
});

test('symlinks to files outside the source are not dereferenced into archives', function (t) {
  const f = fixture(t);
  file(f.root, 'private.txt', 'not for release');
  mkdirSync(join(f.workspace, 'dist'));
  symlinkSync(join(f.root, 'private.txt'), join(f.workspace, 'dist/link'));
  const directory = f.snapshot();
  const result = f.archive('build', { BUILD_ARTIFACT_PATH: 'dist', RELEASE_FILES: directory });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(execFileSync('unzip', ['-p', join(directory, 'build.zip'), 'build/link'], { encoding: 'utf8' }), join(f.root, 'private.txt'));
  assert.match(execFileSync('tar', ['-tvzf', join(directory, 'build.tar.gz')], { encoding: 'utf8' }), /build\/link ->/);
});

test('GitHub assets use the repository and semantic-release version in both names', function (t) {
  const f = fixture(t);
  file(f.root, 'build.zip');
  file(f.root, 'build.tar.gz');
  const options = releaseOptions('owner/froobnicator', 'https://github.com', f.root);
  assert.deepEqual(options.branches, ['main']);
  assert.equal(options.repositoryUrl, 'https://github.com/owner/froobnicator.git');
  assert.equal(options.tagFormat, 'v${version}');
  const plugins = options.plugins!;
  assert.equal(plugins.length, 3);
  const githubPlugin = plugins[2];
  assert.ok(Array.isArray(githubPlugin));
  assert.equal(githubPlugin[0], require.resolve('@semantic-release/github'));
  assert.deepEqual(githubPlugin[1].assets, [
    { path: join(f.root, 'build.zip'), name: 'froobnicator-${nextRelease.version}.zip' },
    { path: join(f.root, 'build.tar.gz'), name: 'froobnicator-${nextRelease.version}.tar.gz' },
  ]);
  assert.equal(options.success, false);
  assert.equal(options.fail, false);
});

test('the GitHub plugin uploads both assets with interpolated version names', async function (t) {
  const f = fixture(t);
  file(f.root, 'build.zip', 'zip payload');
  file(f.root, 'build.tar.gz', 'tar payload');
  const options = releaseOptions('owner/froobnicator', 'https://github.com', f.root);
  const githubPlugin = options.plugins![2];
  assert.ok(Array.isArray(githubPlugin));
  const publishPath = join(dirname(require.resolve('@semantic-release/github')), 'lib/publish.js');
  const { default: publish } = await import(pathToFileURL(publishPath).href);
  const uploads: { name: string; data: Buffer }[] = [];
  const calls: string[] = [];
  class MockOctokit {
    async request(route: string | { name: string; data: Buffer }) {
      if (typeof route !== 'string') {
        uploads.push(route);
        return { data: { browser_download_url: `https://example.com/${route.name}` } };
      }
      calls.push(route);
      return { data: { id: 1, upload_url: 'https://example.com/upload', html_url: 'https://example.com/release' } };
    }
  }
  await publish(githubPlugin[1], {
    cwd: f.workspace,
    env: {},
    options,
    branch: { name: 'main', type: 'release', main: true },
    nextRelease: { version: '1.2.3', gitTag: 'v1.2.3', name: 'v1.2.3', notes: 'Release notes' },
    logger: { log() {}, error(message: string) { assert.fail(message); } },
  }, { Octokit: MockOctokit });
  uploads.sort(function (a, b) { return a.name.localeCompare(b.name); });
  assert.deepEqual(uploads.map(function (upload) { return [upload.name, upload.data.toString()]; }), [
    ['froobnicator-1.2.3.tar.gz', 'tar payload'],
    ['froobnicator-1.2.3.zip', 'zip payload'],
  ]);
  assert.deepEqual(calls, ['POST /repos/{owner}/{repo}/releases', 'PATCH /repos/{owner}/{repo}/releases/{release_id}']);
});

test('missing archives fail before semantic-release can tag a release', function (t) {
  const f = fixture(t);
  file(f.root, 'build.zip');
  assert.throws(function () { releaseOptions('owner/repo', 'https://github.com', f.root); }, /ENOENT/);
});

test('release isolates caller config and cosmiconfig meta-config using the actual working directory', async function (t) {
  const f = releaseFixture(t);
  file(f.workspace, '.releaserc.cjs', 'throw new Error("Caller release config must not execute");');
  file(f.workspace, 'package.json', JSON.stringify({ release: { extends: 'missing-plugin', dryRun: true } }));
  const callerHook = join(f.workspace, 'caller-publish.cjs');
  file(f.workspace, 'caller-publish.cjs', 'module.exports = () => { throw new Error("Caller publisher must not execute"); };');
  file(f.workspace, '.config/config.json', JSON.stringify({ cosmiconfig: {}, release: { publish: callerHook } }));
  const getConfigPath = join(dirname(require.resolve('semantic-release')), 'lib/get-config.js');
  const { default: getConfig } = await import(pathToFileURL(getConfigPath).href);
  const logger = { log() {}, error() {}, success() {}, scope() { return this; } };
  let directory: string | undefined;
  await release(async function (options, environment) {
    directory = environment!.cwd!;
    assert.equal(process.cwd(), directory);
    const configured = await getConfig({ ...environment, env: process.env, logger }, options);
    assert.deepEqual(configured.options.branches, ['main']);
    assert.equal(configured.options.dryRun, undefined);
    assert.equal(configured.options.extends, undefined);
    assert.equal(configured.options.publish, undefined);
    assert.equal(configured.options.plugins.length, 4);
    assert.equal(configured.options.success, false);
    assert.equal(configured.options.fail, false);
    const context = { ...environment, env: process.env, logger, options: configured.options, lastRelease: {} };
    for (const [message, expected] of [
      ['feat: new feature', 'minor'],
      ['fix: correct behavior', 'patch'],
      ['feat!: break compatibility\n\nBREAKING CHANGE: new API', 'major'],
      ['docs: explain usage', undefined],
    ]) {
      assert.equal(await configured.plugins.analyzeCommits({ ...context, commits: [{ message, hash: 'abc123' }] }), expected);
    }
    return false;
  });
  assert.equal(process.cwd(), f.workspace);
  assert.ok(directory && !existsSync(directory));
  assert.doesNotMatch(readFileSync(process.env.MOCK_GH_CALLS!, 'utf8'), /releases\/tags/);
});

test('release restores its working directory and removes isolation files after failure', async function (t) {
  const f = releaseFixture(t);
  let directory: string | undefined;
  await assert.rejects(release(async function (_options, environment) {
    directory = environment!.cwd!;
    assert.equal(process.cwd(), directory);
    throw new Error('Publication failed');
  }), /Publication failed/);
  assert.equal(process.cwd(), f.workspace);
  assert.ok(directory && !existsSync(directory));
  await assert.rejects(release(async function () { return false; }), /stopped before analyzing commits/);
  assert.equal(process.cwd(), f.workspace);
});

test('no-op verification rejects missing, draft, incomplete, and inaccessible releases', function (t) {
  const f = releaseFixture(t);
  const lastRelease = { gitTag: 'v1.0.0', version: '1.0.0' };
  assert.doesNotThrow(function () { assertPublishedRelease(f.workspace, 'owner/froobnicator', {}); });
  assert.equal(existsSync(process.env.MOCK_GH_CALLS!), false);
  assert.doesNotThrow(function () { assertPublishedRelease(f.workspace, 'owner/froobnicator', lastRelease); });
  for (const changes of [
    { draft: true },
    { prerelease: true },
    { published_at: null },
    { tag_name: 'v0.9.0' },
    { assets: [] },
    { assets: publishedRelease().assets.slice(0, 1) },
    { assets: publishedRelease().assets.map(function (asset) { return { ...asset, state: 'starter' }; }) },
    { assets: publishedRelease().assets.map(function (asset) { return { ...asset, size: 0 }; }) },
  ]) {
    process.env.MOCK_RELEASE = JSON.stringify({ ...publishedRelease(), ...changes });
    assert.throws(function () { assertPublishedRelease(f.workspace, 'owner/froobnicator', lastRelease); }, /Cannot verify.*v1\.0\.0.*tagged commit.*Preserve the existing tag/);
  }
  for (const response of ['null', '{}', 'not JSON']) {
    process.env.MOCK_RELEASE = response;
    assert.throws(function () { assertPublishedRelease(f.workspace, 'owner/froobnicator', lastRelease); }, /Cannot verify/);
  }
  process.env.MOCK_RELEASE = JSON.stringify(publishedRelease());
  process.env.MOCK_RELEASE_STATUS = '1';
  assert.throws(function () { assertPublishedRelease(f.workspace, 'owner/froobnicator', lastRelease); }, /API lookup failed/);
  assert.ok(readFileSync(process.env.MOCK_GH_CALLS!, 'utf8').trim().split('\n').every(function (call) {
    return call === 'api repos/owner/froobnicator/releases/tags/v1.0.0';
  }));
});

test('failed publication after tagging cannot become a successful no-op on retry', function (t) {
  const f = releaseFixture(t);
  const remote = join(f.root, 'remote.git');
  f.git('init', '--quiet', '--bare', '--initial-branch=main', remote);
  f.git('remote', 'add', 'origin', remote);
  // All Git transport stays in the temporary fixture; no GitHub calls or publication occur.
  f.git('-C', remote, 'fetch', '--quiet', f.workspace, 'main:main');
  // semantic-release intercepts stdout, which would corrupt node:test's IPC in this process.
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { execFileSync } from 'node:child_process';
    import semanticRelease from ${JSON.stringify(pathToFileURL(require.resolve('semantic-release')).href)};
    import { release } from ${JSON.stringify(new URL('./release.mts', import.meta.url).href)};
    const workspace = process.env.GITHUB_WORKSPACE;
    const root = process.env.RELEASE_FILES;
    const remote = root + '/remote.git';
    const completeRelease = process.env.MOCK_RELEASE;
    function git(...args) {
      return execFileSync('git', args, { cwd: workspace, encoding: 'utf8' }).trim();
    }
    let publishCalls = 0;
    async function runLocally(options, environment) {
      return semanticRelease({
        ...options,
        repositoryUrl: remote,
        ci: false,
        verifyConditions: false,
        generateNotes: false,
        addChannel: false,
        publish() {
          publishCalls++;
          assert.equal(git('-C', remote, 'rev-parse', 'v1.0.0'), process.env.GITHUB_SHA);
          throw new Error('Simulated GitHub outage after tagging');
        },
      }, {
        ...environment,
        env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
      });
    }
    await assert.rejects(release(runLocally), /Simulated GitHub outage after tagging/);
    process.env.MOCK_RELEASE_STATUS = '1';
    await assert.rejects(release(runLocally), /Cannot verify a complete GitHub release for v1[.]0[.]0/);
    process.env.MOCK_RELEASE_STATUS = '0';
    process.env.MOCK_RELEASE = JSON.stringify({ ...JSON.parse(completeRelease), draft: true });
    await assert.rejects(release(runLocally), /Cannot verify a complete GitHub release for v1[.]0[.]0/);

    git('commit', '--quiet', '--allow-empty', '-m', 'docs: clarify usage');
    git('-C', remote, 'fetch', '--quiet', workspace, 'main:main');
    process.env.GITHUB_SHA = git('rev-parse', 'HEAD');
    await assert.rejects(release(runLocally), /Cannot verify a complete GitHub release for v1[.]0[.]0/);
    process.env.MOCK_RELEASE = completeRelease;
    await release(runLocally);
    assert.equal(publishCalls, 1);
    assert.equal(process.cwd(), workspace);
  `], { cwd: f.workspace, encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.error?.message || result.stdout + result.stderr);
});

test('release refuses a changed checkout, advanced main, and API errors', function (t) {
  const f = fixture(t);
  const bin = join(f.root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'git'), '#!/bin/sh\nprintf "%s\\n" "$MOCK_HEAD"\n', { mode: 0o755 });
  writeFileSync(join(bin, 'gh'), '#!/bin/sh\nprintf "%s\\n" "$MOCK_REMOTE"\nexit "${MOCK_STATUS:-0}"\n', { mode: 0o755 });
  const originalEnv = { ...process.env };
  t.after(function () { process.env = originalEnv; });
  process.env.PATH = `${bin}:${process.env.PATH}`;
  process.env.MOCK_HEAD = 'verified';
  process.env.MOCK_REMOTE = 'verified';
  assert.doesNotThrow(function () { assertReleaseCommit(f.workspace, 'verified'); });
  process.env.MOCK_HEAD = 'different';
  assert.throws(function () { assertReleaseCommit(f.workspace, 'verified'); }, /checked-out commit changed/);
  process.env.MOCK_HEAD = 'verified';
  process.env.MOCK_REMOTE = 'newer';
  assert.throws(function () { assertReleaseCommit(f.workspace, 'verified'); }, /main advanced/);
  process.env.MOCK_STATUS = '1';
  assert.throws(function () { assertReleaseCommit(f.workspace, 'verified'); }, /Command failed/);
});
