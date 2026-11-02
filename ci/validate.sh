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

echo "==> Validating shared/skills/ frontmatter (discovery + lazy-load contract)..."
if [ -d shared/skills ]; then
  for dir in shared/skills/*/; do
    name=$(basename "$dir")
    skill_file="$dir/SKILL.md"
    [ -f "$skill_file" ] || (echo "ERROR: $dir has no SKILL.md" && exit 1)

    # Frontmatter must exist (--- ... ---) and declare a non-empty name + description
    awk '/^---$/{c++; next} c==1' "$skill_file" > /tmp/skill-frontmatter.$$ 2>/dev/null
    grep -q '^name:' /tmp/skill-frontmatter.$$ || (echo "ERROR: $skill_file missing 'name:' in frontmatter" && rm -f /tmp/skill-frontmatter.$$ && exit 1)
    grep -q '^description:' /tmp/skill-frontmatter.$$ || (echo "ERROR: $skill_file missing 'description:' in frontmatter" && rm -f /tmp/skill-frontmatter.$$ && exit 1)

    declared_name=$(grep '^name:' /tmp/skill-frontmatter.$$ | head -1 | sed 's/^name:[[:space:]]*//' | tr -d '\r')
    rm -f /tmp/skill-frontmatter.$$
    [ "$declared_name" = "$name" ] || (echo "ERROR: $skill_file name '$declared_name' does not match directory '$name'" && exit 1)
  done
fi

echo "==> All validations passed."
