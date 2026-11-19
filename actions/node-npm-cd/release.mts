import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semanticRelease, { type AnalyzeCommitsContext, type LastRelease, type Options, type PluginSpec } from 'semantic-release';

const require = createRequire(import.meta.url);

export function releaseOptions(repository: string, serverUrl: string, releaseFiles: string): Options {
  const repositoryName = repository.split('/')[1];
  const assets = ['zip', 'tar.gz'].map(function (extension) {
    const path = join(releaseFiles, `build.${extension}`);
    if (!statSync(path).isFile()) {
      throw new Error(`Release archive is not a file: ${path}`);
    }
    return { path, name: `${repositoryName}-\${nextRelease.version}.${extension}` };
  });

  return {
    branches: ['main'],
    repositoryUrl: `${serverUrl}/${repository}.git`,
    tagFormat: 'v${version}',
    plugins: [
      [require.resolve('@semantic-release/commit-analyzer'), { preset: 'conventionalcommits' }],
      [require.resolve('@semantic-release/release-notes-generator'), { preset: 'conventionalcommits' }],
      [require.resolve('@semantic-release/github'), { assets }],
    ],
    // This workflow publishes releases only, without commenting on or labelling issues and PRs.
    success: false,
    fail: false,
  };
}

export function createReleaseDirectory(workspace: string): string {
  // A nearer config prevents the caller's release settings/plugins from enabling npm publication.
  // Keep this directory inside the checkout so Git still discovers the caller's repository.
  const directory = mkdtempSync(join(workspace, '.node-npm-cd-release-'));
  writeFileSync(join(directory, '.releaserc.json'), '{}\n');
  return directory;
}

export function assertReleaseCommit(workspace: string, sha: string): void {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
  if (head !== sha) {
    throw new Error('The checked-out commit changed after CI verification; refusing to release.');
  }
  const remote = execFileSync('gh', ['api', 'repos/{owner}/{repo}/git/ref/heads/main', '--jq', '.object.sha'], {
    cwd: workspace,
    encoding: 'utf8',
  }).trim();
  if (remote !== sha) {
    throw new Error('main advanced after this run started; run CD again for the new commit.');
  }
}

export function assertPublishedRelease(workspace: string, repository: string, lastRelease: Partial<LastRelease>): void {
  const { gitTag, version } = lastRelease;
  if (!gitTag) return;

  const repositoryName = repository.split('/')[1];
  const expectedAssets = ['zip', 'tar.gz'].map(function (extension) {
    return `${repositoryName}-${version}.${extension}`;
  });
  try {
    const published: {
      tag_name: string;
      draft: boolean;
      prerelease: boolean;
      published_at: string | null;
      assets: { name: string; state: string; size: number }[];
    } = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/releases/tags/${encodeURIComponent(gitTag)}`], {
      cwd: workspace,
      encoding: 'utf8',
    }));
    if (published.tag_name !== gitTag || published.draft !== false || published.prerelease !== false || !published.published_at) {
      throw new Error('The release is not published as a stable release.');
    }
    for (const name of expectedAssets) {
      if (!published.assets.some(function (asset) { return asset.name === name && asset.state === 'uploaded' && asset.size > 0; })) {
        throw new Error(`The release is missing a completed asset: ${name}`);
      }
    }
  } catch (cause) {
    throw new Error(
      `Cannot verify a complete GitHub release for ${gitTag}. ` +
      'Inspect the original release run and the GitHub release/draft. ' +
      `Restore the release notes and assets (${expectedAssets.join(', ')}) from the tagged commit, ` +
      'not the current main build, and finish publication manually before retrying. Preserve the existing tag. ' +
      'If the API lookup failed, resolve that error first.',
      { cause },
    );
  }
}

export async function release(runSemanticRelease: typeof semanticRelease = semanticRelease): Promise<void> {
  const { GITHUB_WORKSPACE, GITHUB_SHA, GITHUB_REPOSITORY, GITHUB_SERVER_URL, RELEASE_FILES } = process.env;
  if (!GITHUB_WORKSPACE || !GITHUB_SHA || !GITHUB_REPOSITORY || !GITHUB_SERVER_URL || !RELEASE_FILES) {
    throw new Error('Missing GitHub Actions release environment.');
  }

  assertReleaseCommit(GITHUB_WORKSPACE, GITHUB_SHA);
  const options = releaseOptions(GITHUB_REPOSITORY, GITHUB_SERVER_URL, RELEASE_FILES);
  let lastRelease: Partial<LastRelease> | undefined;
  const observer = {
    analyzeCommits(_config: unknown, context: AnalyzeCommitsContext) {
      // Use semantic-release's selected baseline, including on documentation-only descendants.
      lastRelease = context.lastRelease;
    },
  };
  // semantic-release supports inline plugins, but its PluginSpec type only lists module paths.
  options.plugins = [...options.plugins!, observer as unknown as PluginSpec];

  const directory = createReleaseDirectory(GITHUB_WORKSPACE);
  const originalDirectory = process.cwd();
  try {
    // cosmiconfig discovers meta-configuration from process.cwd(), not its search(cwd) argument.
    process.chdir(directory);
    const result = await runSemanticRelease(options, { cwd: directory });
    if (!result) {
      // semantic-release also returns false for an outdated checkout, not only a no-change release.
      assertReleaseCommit(GITHUB_WORKSPACE, GITHUB_SHA);
      if (!lastRelease) {
        throw new Error('semantic-release stopped before analyzing commits; no release was verified.');
      }
      assertPublishedRelease(GITHUB_WORKSPACE, GITHUB_REPOSITORY, lastRelease);
      console.log('No release-worthy commits; no GitHub release created.');
    }
  } finally {
    process.chdir(originalDirectory);
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await release();
}
