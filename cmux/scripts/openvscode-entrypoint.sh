#!/usr/bin/env bash
set -euo pipefail

HOME_DIR="${HOME:-/root}"

if [ -d "${HOME_DIR}/.vscode-remote" ]; then
  REMOTE_ROOT="${HOME_DIR}/.vscode-remote"
elif [ -d "${HOME_DIR}/.vscode-server" ]; then
  REMOTE_ROOT="${HOME_DIR}/.vscode-server"
else
  REMOTE_ROOT="${HOME_DIR}/.vscode-remote"
fi

USER_DATA_DIR="${REMOTE_ROOT}/data"
MACHINE_DIR="${USER_DATA_DIR}/Machine"
USER_DIR="${USER_DATA_DIR}/User"

mkdir -p "${MACHINE_DIR}" "${USER_DIR}"

EXT_DIR="${HOME_DIR}/.openvscode-server/extensions"
if [ ! -d "${EXT_DIR}" ]; then
  if mkdir -p "${EXT_DIR}" 2>/dev/null; then
    :
  elif mkdir -p "${HOME_DIR}/.vscode-server/extensions" 2>/dev/null; then
    EXT_DIR="${HOME_DIR}/.vscode-server/extensions"
  else
    EXT_DIR="${HOME_DIR}/.vscode-remote/extensions"
    mkdir -p "${EXT_DIR}"
  fi
fi

SEED_DIR="${CMUX_VSCODE_SEED_DIR:-/cmux/vscode}"

copy_seed_file() {
  local src="$1"
  local dest="$2"
  if [ -f "${src}" ]; then
    install -m 0644 "${src}" "${dest}"
  fi
}

sync_seed_dir() {
  local src="$1"
  local dest="$2"
  if [ -d "${src}" ]; then
    mkdir -p "${dest}"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a --delete "${src}/" "${dest}/"
    else
      rm -rf "${dest}"
      mkdir -p "${dest}"
      cp -a "${src}"/. "${dest}/"
    fi
  fi
}

copy_seed_file "${SEED_DIR}/settings.json" "${MACHINE_DIR}/settings.json"
copy_seed_file "${SEED_DIR}/keybindings.json" "${USER_DIR}/keybindings.json"
sync_seed_dir "${SEED_DIR}/snippets" "${USER_DIR}/snippets"

if [ -d "${SEED_DIR}/extensions" ]; then
  sync_seed_dir "${SEED_DIR}/extensions" "${EXT_DIR}"
fi

if [ -f "${SEED_DIR}/extensions.txt" ]; then
  if command -v openvscode-server >/dev/null 2>&1; then
    OPENVSCODE_CLI="$(command -v openvscode-server)"
  elif [ -x "/app/openvscode-server/bin/openvscode-server" ]; then
    OPENVSCODE_CLI="/app/openvscode-server/bin/openvscode-server"
  else
    OPENVSCODE_CLI=""
  fi
  if [ -n "${OPENVSCODE_CLI}" ]; then
    while IFS= read -r extension_id; do
      [ -z "${extension_id}" ] && continue
      "${OPENVSCODE_CLI}" \
        --extensions-dir "${EXT_DIR}" \
        --user-data-dir "${REMOTE_ROOT}" \
        --install-extension "${extension_id}" >/dev/null 2>&1 || true
    done < "${SEED_DIR}/extensions.txt"
  fi
fi

if command -v openvscode-server >/dev/null 2>&1; then
  OPENVSCODE_BIN="$(command -v openvscode-server)"
elif [ -x "/app/openvscode-server/bin/openvscode-server" ]; then
  OPENVSCODE_BIN="/app/openvscode-server/bin/openvscode-server"
else
  echo "openvscode-entrypoint: openvscode-server binary not found" >&2
  exit 1
fi

exec "${OPENVSCODE_BIN}" \
  --user-data-dir "${REMOTE_ROOT}" \
  --extensions-dir "${EXT_DIR}" \
  "$@"
