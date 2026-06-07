export const PrivacyTechnologies = {
  HOMOMORPHIC_ENCRYPTION: {
    description: 'Compute on encrypted data without decryption',
    privacyLevel: 'HIGH',
    performance: 'LOW (1000x slower)',
    useCase: 'Computation on sensitive data',
    trustModel: 'Trusted server, untrusted environment',
    keySize: '2.6 KB',
    computationOverhead: '100x - 1000x',
  },
  
  SECURE_MPC: {
    description: 'Distributed computation with secret sharing',
    privacyLevel: 'VERY_HIGH',
    performance: 'MEDIUM (10x slower)',
    useCase: 'Multi-party data collaboration',
    trustModel: 'Distributed trust among parties',
    keySize: 'Variable',
    computationOverhead: '10x - 100x',
  },
  
  DIFFERENTIAL_PRIVACY: {
    description: 'Statistical noise for aggregate queries',
    privacyLevel: 'MEDIUM',
    performance: 'HIGH (near native)',
    useCase: 'Statistical analytics and ML',
    trustModel: 'Trusted data curator',
    keySize: 'N/A',
    computationOverhead: '1x - 2x',
  },
  
  ZERO_KNOWLEDGE_PROOFS: {
    description: 'Prove statement without revealing secret',
    privacyLevel: 'HIGH',
    performance: 'MEDIUM (5x slower)',
    useCase: 'Verification without disclosure',
    trustModel: 'Verifier trust',
    keySize: '4.6 KB',
    computationOverhead: '5x - 10x',
  },
  
  QUANTUM_RESISTANT: {
    description: 'Secure against quantum computers',
    privacyLevel: 'FUTURE_PROOF',
    performance: 'LOW (20x slower)',
    useCase: 'Long-term data protection',
    trustModel: 'Trusted infrastructure',
    keySize: '8.2 KB',
    computationOverhead: '20x - 50x',
  },
};