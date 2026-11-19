#!/usr/bin/env bash
set -euo pipefail

validate_directory() {
  local directory workspace
  directory="$(realpath -e -- "$1")"
  workspace="$(realpath -e -- "$GITHUB_WORKSPACE")"
  if [[ ! -d "$directory" || "$directory" != "$workspace/"* || "$directory" == "$workspace/.node-npm-cd-tools" || "$directory" == "$workspace/.node-npm-cd-tools/"* ]]; then
    echo '::error::Archive sources must be directories inside the caller repository, not its root or workflow tools.' >&2
    exit 1
  fi
  if [[ "$directory/" == *'/.git/'* || -n "$(find "$directory" -name .git -print -quit)" ]]; then
    echo '::error::Archive sources must not contain Git metadata.' >&2
    exit 1
  fi
  printf '%s\n' "$directory"
}

case "${1:-}" in
  screenshots)
    release_files="$(mktemp -d "$RUNNER_TEMP/node-npm-cd.XXXXXX")"
    mkdir "$release_files/payload"
    if [[ -n "$SCREENSHOTS_PATH" ]]; then
      directory="$(validate_directory "$SCREENSHOTS_PATH")"
      cp -a -- "$directory" "$release_files/payload/screenshots"
    fi
    printf 'directory=%s\n' "$release_files" >> "$GITHUB_OUTPUT"
    ;;
  build)
    directory="$(validate_directory "$BUILD_ARTIFACT_PATH")"
    cp -a -- "$directory" "$RELEASE_FILES/payload/build"
    cd -- "$RELEASE_FILES/payload"
    # Both formats preserve dotfiles, empty directories, and symlinks without following them.
    zip -q -r -y "$RELEASE_FILES/build.zip" .
    tar -czf "$RELEASE_FILES/build.tar.gz" .
    ;;
  *)
    echo 'Usage: archive.sh screenshots|build' >&2
    exit 1
    ;;
esac
