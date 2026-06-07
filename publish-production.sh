#!/bin/bash
set -e

echo "📦 Publishing to Production"
echo "==========================="

# 1. Run final tests
echo "Running final tests..."
npm run test:all
npm run security:scan
npm run performance:test

# 2. Build production assets
echo "Building production assets..."
cd backend && npm run build
cd ../frontend && npm run build

# 3. Create release tag
VERSION=$(node -p "require('./package.json').version")
git tag -a "v${VERSION}" -m "Release v${VERSION}"
git push origin "v${VERSION}"

# 4. Deploy to production
echo "Deploying to production..."
./deploy-all.sh

# 5. Verify deployment
echo "Verifying deployment..."
./verify-deployment.sh

# 6. Run smoke tests
echo "Running smoke tests..."
npm run test:smoke

# 7. Update documentation
echo "Updating documentation..."
npm run docs:generate

# 8. Notify team
echo "Sending notifications..."
curl -X POST -H 'Content-type: application/json' \
  --data "{\"text\":\"🎉 Release v${VERSION} deployed to production successfully!\"}" \
  $SLACK_WEBHOOK_URL

echo ""
echo "✅ Production release v${VERSION} complete!"
echo "Monitor: https://grafana.yourdomain.com"