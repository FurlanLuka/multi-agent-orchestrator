#!/bin/bash
#
# Update Homebrew cask with new release SHA256 values
#
# Usage: ./scripts/update-homebrew-cask.sh v1.0.0
#

set -e

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 v1.0.0"
    exit 1
fi

# Remove 'v' prefix if present
VERSION_NUM="${VERSION#v}"

CASK_FILE="homebrew-orchestrator/Casks/orchestrator.rb"
RELEASE_BASE_URL="https://github.com/OWNER/orchestrator/releases/download/${VERSION}"

echo "Updating Homebrew cask for version ${VERSION_NUM}..."

# Download DMG files to get SHA256
ARM64_DMG="Orchestrator_${VERSION_NUM}_aarch64.dmg"
X64_DMG="Orchestrator_${VERSION_NUM}_x64.dmg"

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "Downloading ${ARM64_DMG}..."
curl -sL "${RELEASE_BASE_URL}/${ARM64_DMG}" -o "${TEMP_DIR}/${ARM64_DMG}"

echo "Downloading ${X64_DMG}..."
curl -sL "${RELEASE_BASE_URL}/${X64_DMG}" -o "${TEMP_DIR}/${X64_DMG}"

# Calculate SHA256
ARM64_SHA=$(shasum -a 256 "${TEMP_DIR}/${ARM64_DMG}" | cut -d' ' -f1)
X64_SHA=$(shasum -a 256 "${TEMP_DIR}/${X64_DMG}" | cut -d' ' -f1)

echo "ARM64 SHA256: ${ARM64_SHA}"
echo "x64 SHA256: ${X64_SHA}"

# Update cask file
if [ -f "$CASK_FILE" ]; then
    # Update version
    sed -i '' "s/version \".*\"/version \"${VERSION_NUM}\"/" "$CASK_FILE"

    # Update SHA256 values
    sed -i '' "s/PLACEHOLDER_ARM64_SHA256/${ARM64_SHA}/" "$CASK_FILE"
    sed -i '' "s/PLACEHOLDER_X64_SHA256/${X64_SHA}/" "$CASK_FILE"

    # If not placeholders, update existing SHA256 values
    # This is a bit hacky but works for the on_arm/on_intel blocks
    perl -i -pe "
        if (/on_arm do/../end/) {
            s/sha256 \"[a-f0-9]+\"/sha256 \"${ARM64_SHA}\"/;
        }
        if (/on_intel do/../end/) {
            s/sha256 \"[a-f0-9]+\"/sha256 \"${X64_SHA}\"/;
        }
    " "$CASK_FILE"

    echo ""
    echo "Updated ${CASK_FILE}"
    echo ""
    echo "Next steps:"
    echo "1. Review the changes: git diff ${CASK_FILE}"
    echo "2. Commit: git add ${CASK_FILE} && git commit -m 'Update to ${VERSION_NUM}'"
    echo "3. Push to the homebrew-orchestrator tap repository"
else
    echo "Error: Cask file not found at ${CASK_FILE}"
    exit 1
fi
