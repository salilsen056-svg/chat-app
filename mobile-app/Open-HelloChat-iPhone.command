#!/bin/zsh
set -e
HELLO_PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -f "$HELLO_PROJECT_DIR/ios/Pods/Manifest.lock" ]; then
  echo "Install iOS dependencies first. See IOS-INSTALL-BN.md."
  exit 1
fi
/usr/bin/open -a Xcode "$HELLO_PROJECT_DIR/ios/HelloChat.xcworkspace"
echo "Connect your iPhone, select your Personal Team in Signing & Capabilities, then press Run."
