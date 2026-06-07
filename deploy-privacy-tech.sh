#!/bin/bash

echo "🔒 Deploying Privacy-Enhancing Technologies..."

# Install dependencies
npm install tenseal-js @mpc/spdz @opendp/opendp

# Set up HE parameters
kubectl create configmap he-config \
  --from-literal=POLY_MODULUS_DEGREE=8192 \
  --from-literal=PRECISION=20

# Set up MPC parameters
kubectl create secret generic mpc-keys \
  --from-file=mpc-keys/

# Set up DP parameters
kubectl create configmap dp-config \
  --from-literal=EPSILON_BUDGET=1.0 \
  --from-literal=DELTA=1e-5

# Deploy privacy services
kubectl apply -f k8s/homomorphic-encryption.yaml
kubectl apply -f k8s/secure-mpc.yaml
kubectl apply -f k8s/differential-privacy.yaml

echo "✅ Privacy technologies deployed"