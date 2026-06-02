#!/bin/bash
# 版本号更新脚本
# 用法: ./scripts/bump-version.sh [patch|minor|major]

set -euo pipefail

BUMP_TYPE="${1:-patch}"
PACKAGE_JSON="package.json"

if [ ! -f "$PACKAGE_JSON" ]; then
  echo "❌ 未找到 package.json"
  exit 1
fi

CURRENT=$(node -p "require('./$PACKAGE_JSON').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP_TYPE" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  *) echo "❌ 未知类型: $BUMP_TYPE (可选: patch, minor, major)"; exit 1 ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"

echo "📦 版本更新: $CURRENT → $NEW_VERSION"

# 更新 package.json
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
"

echo "✅ package.json 已更新"
echo ""
echo "下一步:"
echo "  1. 更新 CHANGELOG.md"
echo "  2. git add -A && git commit -m 'release: v$NEW_VERSION'"
echo "  3. git tag v$NEW_VERSION"
echo "  4. git push origin main --tags"
