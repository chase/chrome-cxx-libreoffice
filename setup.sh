#!/bin/bash

sync_workspace() {
  echo "[setup] Syncing gclient workspace"
  export PATH="$PWD/depot_tools:$PATH"
  export TAR_OPTIONS="--no-same-owner --no-same-permissions"
  chmod -R 775 $PWD/third_party/node
  export TEMPDIR=$(mktemp)
  gclient sync --no-history -v -v
}

setup() {
  STARTING_DIR=$PWD

  echo "[setup] Setting up depot_tools"
  git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
  export PATH="$PWD/depot_tools:$PATH"
  update_depot_tools

  sync_workspace
}

if [ -e "$PWD/depot_tools" ]; then
  sync_workspace
else
  setup
fi
