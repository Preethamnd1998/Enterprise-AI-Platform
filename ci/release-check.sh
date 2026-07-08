#!/bin/sh
set -e
VERSION=$(cat VERSION | tr -d '[:space:]')
EXPECTED="v${VERSION}"
if [ "$CI_COMMIT_TAG" != "$EXPECTED" ]; then
  echo "ERROR: tag $CI_COMMIT_TAG does not match VERSION v$VERSION"
  exit 1
fi
echo "OK: tag $CI_COMMIT_TAG matches VERSION $VERSION"
