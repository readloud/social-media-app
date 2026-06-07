#!/bin/bash
echo "🏗️ Running Terraform security scans..."

# Run tfsec
tfsec . \
  --format json \
  --out reports/tfsec-results.json \
  --severity CRITICAL,HIGH \
  --exclude-dir .terraform

# Run checkov
checkov -d . \
  --framework terraform \
  --output json \
  --output-file-path reports/checkov-results.json \
  --skip-check CKV_AWS_115

# Run terrascan
terrascan scan \
  -i terraform \
  -f . \
  --severity high \
  --iac-type terraform \
  --policy-type aws \
  --output json \
  --config-path .terrascan/config.toml

echo "✅ Terraform security scans completed"