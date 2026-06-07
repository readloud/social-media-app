#!/bin/bash
set -e

echo "🔒 Starting comprehensive security scanning..."
echo "=============================================="

# Create reports directory
mkdir -p reports

# 1. SAST Scan
echo "📝 Running SAST scans..."
npm run lint:security
npx sonar-scanner

# 2. Dependency Scan
echo "📦 Running dependency scans..."
node security/dependency-scan.js

# 3. Container Scan
echo "🐳 Running container scans..."
bash security/trivy/scan.sh

# 4. Infrastructure Scan
echo "🏗️ Running infrastructure scans..."
bash security/terraform/scan.sh

# 5. DAST Scan (if app is running)
if curl -s http://localhost:3000/health > /dev/null; then
    echo "🌐 Running DAST scans..."
    node security/zap/zap-scan.js
else
    echo "⚠️ Application not running, skipping DAST scan"
fi

# 6. Secrets Scan
echo "🔑 Scanning for secrets..."
git secrets --scan
trufflehog --json --results reports/trufflehog.json .

# 7. Generate Report
echo "📊 Generating security report..."
python security/generate-report.py

echo "=============================================="
echo "✅ Security scanning completed!"
echo "📄 Reports available in /reports directory"
echo "🌐 Open security-dashboard.html to view results"