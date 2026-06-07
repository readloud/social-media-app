#!/bin/bash

echo "🔒 Deploying security and performance optimizations..."

# Deploy auto-scaling
kubectl apply -f k8s/hpa.yaml

# Deploy circuit breaker config
kubectl create configmap circuit-breaker-config \
  --from-file=config/circuit-breaker.yaml

# Deploy load management
kubectl apply -f k8s/load-management.yaml

# Run penetration tests
npm run test:pentest

# Initialize training program
npm run training:init

echo "✅ Security and performance systems deployed"