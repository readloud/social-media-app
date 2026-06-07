#!/bin/bash
echo "🔒 Running Trivy security scans..."

# Scan backend image
trivy image \
  --severity CRITICAL,HIGH \
  --exit-code 1 \
  --ignore-unfixed \
  --format table \
  --output reports/trivy-backend.txt \
  social-media-backend:latest

# Scan frontend image
trivy image \
  --severity CRITICAL,HIGH \
  --exit-code 1 \
  --ignore-unfixed \
  --format table \
  --output reports/trivy-frontend.txt \
  social-media-frontend:latest

# Scan filesystem
trivy filesystem \
  --severity CRITICAL,HIGH \
  --exit-code 1 \
  --skip-dirs node_modules \
  --skip-dirs dist \
  --output reports/trivy-fs.txt \
  ../

# Scan infrastructure code
trivy config \
  --severity CRITICAL,HIGH \
  --exit-code 1 \
  --output reports/trivy-infra.txt \
  ../terraform/

echo "✅ Trivy scans completed"