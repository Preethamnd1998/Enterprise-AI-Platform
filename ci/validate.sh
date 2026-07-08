#!/bin/sh
set -e

echo "==> Checking shared/contract.md..."
test -f shared/contract.md || (echo "ERROR: missing shared/contract.md" && exit 1)

echo "==> Validating plugin.json..."
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8'))"

echo "==> Validating marketplace.json..."
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"

echo "==> Checking VERSION format..."
VERSION=$(cat VERSION | tr -d '[:space:]')
echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || (echo "ERROR: bad VERSION: $VERSION" && exit 1)

echo "==> Checking all commands embed shared contract..."
for f in commands/*.md; do
  grep -q 'shared' "$f" || (echo "ERROR: $f does not reference shared contract" && exit 1)
done

echo "==> All validations passed."
