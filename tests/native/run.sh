#!/bin/bash
set -euo pipefail

# This is a macOS Network.framework integration test. It creates a temporary
# local Bonjour listener and loopback clients, and tests real TLS handshakes.
# Every run uses a unique Keychain service, deleted even when a check fails.
test_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$test_dir/../.." && pwd)"
run_dir="$(mktemp -d "${TMPDIR:-/tmp}/bridge-native-tests.XXXXXX")"
keychain_service="BridgeRoom.nativeSeatCredentials.tests.$(uuidgen)"
cleanup() {
    security delete-generic-password -s "$keychain_service" -a seats >/dev/null 2>&1 || true
    rm -rf "$run_dir"
}
trap cleanup EXIT

python3 - "$project_dir/native/ios/BridgeRoom/NearbyTransport.swift" "$run_dir/NearbyTransport.swift" "$keychain_service" <<'PY'
from pathlib import Path
import sys
source = Path(sys.argv[1]).read_text()
# The source otherwise remains identical; only access control and the isolated
# Keychain service change. Production APIs drive joins, payloads and lifecycle.
source = source.replace('private ', '')
source = source.replace('BridgeRoom.nativeSeatCredentials.v1', sys.argv[3])
Path(sys.argv[2]).write_text(source)
PY

swiftc -module-cache-path "$run_dir/modules" \
    "$run_dir/NearbyTransport.swift" "$test_dir/NearbyTransportRegression.swift" \
    -o "$run_dir/native-regression"
"$run_dir/native-regression"
