#!/usr/bin/env bash
set -euo pipefail
gradle :staffApp:assembleDebug :customerApp:assembleDebug :staffApp:bundleRelease :customerApp:bundleRelease
