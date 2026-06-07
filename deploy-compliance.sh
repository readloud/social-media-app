#!/bin/bash

echo "🔐 Deploying compliance framework..."

# Run GDPR compliance checks
npm run compliance:gdpr

# Enable audit logging
kubectl apply -f k8s/audit-logging.yaml

# Deploy backup system
kubectl apply -f k8s/backup-cronjob.yaml

# Configure incident response
kubectl create configmap incident-playbooks --from-file=playbooks/

# Set up monitoring alerts
kubectl apply -f monitoring/alert-rules.yaml

# Enable disaster recovery
kubectl apply -f dr/failover-config.yaml

echo "✅ Compliance and DR systems deployed"