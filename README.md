# valo.media GitHub Workflows

Private shared GitHub Actions automation for valo.media repositories.

## Scheduled SFTP release deployment

Use `scheduled-sftp-release.yml` from a repository-local wrapper workflow
that owns the schedule and repository-specific inputs.

```yaml
jobs:
  deploy:
    uses: valomedia/github-workflows/.github/workflows/scheduled-sftp-release.yml@v1
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
deploys it to SFTP,
and creates a GitHub Release with GitHub-generated notes.

The SFTP deploy action deletes stale remote app files during sync
and excludes root `.ht*` files such as `.htaccess`
from overwrite and deletion.
