#!/bin/bash

echo "🔗 Deploying Blockchain Verification System..."

# Deploy smart contract
cd blockchain
truffle migrate --network mainnet

# Set up blockchain monitoring
kubectl create configmap blockchain-config \
  --from-literal=RPC_URL=$BLOCKCHAIN_RPC_URL \
  --from-literal=CONTRACT_ADDRESS=$CONTRACT_ADDRESS

# Deploy anomaly detection model
python models/train_anomaly_model.py
kubectl create configmap ml-model --from-file=./models/anomaly-detection

# Deploy services
kubectl apply -f k8s/blockchain-service.yaml
kubectl apply -f k8s/anomaly-detection.yaml

echo "✅ Advanced security systems deployed"