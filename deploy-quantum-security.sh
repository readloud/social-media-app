#!/bin/bash

echo "🔐 Deploying Quantum-Resistant Security..."

# Install PQ crypto libraries
npm install @pqcrypto/kyber @pqcrypto/dilithium @pqcrypto/sphincsplus

# Compile ZKP circuits
circom circuits/schedule_verification.circom --r1cs --wasm --sym
snarkjs groth16 setup schedule_verification.r1cs pot12_final.ptau schedule_verification_0000.zkey
snarkjs zkey export verificationkey schedule_verification_0000.zkey verification_key.json

# Deploy quantum key service
kubectl create configmap pqc-config \
  --from-file=./circuits \
  --from-file=./verification_key.json

# Deploy services
kubectl apply -f k8s/zkp-service.yaml
kubectl apply -f k8s/quantum-crypto-service.yaml

# Initialize quantum key database
kubectl exec -it postgres -- psql -U postgres -d social_media -c "
  CREATE TABLE IF NOT EXISTS quantum_keys (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    algorithm VARCHAR(50),
    public_key TEXT,
    private_key TEXT,
    security_level INT,
    created_at TIMESTAMP,
    expires_at TIMESTAMP,
    status VARCHAR(20)
  );
"

echo "✅ Quantum-resistant security deployed"