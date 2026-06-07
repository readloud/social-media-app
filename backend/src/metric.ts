// Performance comparison
export const PerformanceMetrics = {
  classical: {
    keyGenTime: '0.5ms',
    signTime: '1ms',
    verifyTime: '0.5ms',
    encryptTime: '0.2ms',
    decryptTime: '0.2ms',
    keySize: '256 bytes',
    signatureSize: '64 bytes',
  },
  
  hybrid: {
    keyGenTime: '15ms',
    signTime: '25ms',
    verifyTime: '8ms',
    encryptTime: '5ms',
    decryptTime: '6ms',
    keySize: '1.6 KB',
    signatureSize: '4.6 KB',
  },
  
  quantumResistant: {
    keyGenTime: '50ms',
    signTime: '100ms',
    verifyTime: '15ms',
    encryptTime: '10ms',
    decryptTime: '12ms',
    keySize: '2.6 KB',
    signatureSize: '8.2 KB',
  },
};

export const PrivacyPerformance = {
  homomorphicEncryption: {
    encryptionTime: '50ms',
    decryptionTime: '30ms',
    additionTime: '5ms',
    multiplicationTime: '15ms',
    memoryPerCiphertext: '64KB',
    maxDepth: 5,  // Keep as number
    operationsPerSecond: 20, // Suggested addition
  },
  
  secureMPC: {
    setupTime: '200ms',
    shareGeneration: '10ms',
    reconstructionTime: '20ms',
    communicationOverhead: '10KB per party',  // Mixed units
    maxParties: 100,  // No units needed (count)
    latency: '50ms per round',
  },
  
  differentialPrivacy: {
    noiseGeneration: '0.1ms',
    budgetCheck: '0.01ms',
    queryProcessing: '5ms',
    memoryOverhead: '1KB per query',
    epsilonRange: '0.01 - 10.0',
  },
  
  throughput: {
    classical: '10000 ops/sec',
    hybrid: '200 ops/sec',
    quantumResistant: '50 ops/sec',
  },
};

export const PerformanceRatios = {
  classicalVsQuantumResistant: {
    keyGenSlowdown: '100x',
    signSlowdown: '100x',
    sizeIncrease: '10.4x',
  },
  hybridVsQuantumResistant: {
    keyGenSlowdown: '3.33x',
    signSlowdown: '4x',
    sizeIncrease: '1.6x',
  },
};

export const PrivacyTechComparison = {
  TEE: {
    privacyGuarantee: 'Hardware isolation',
    performanceImpact: 'LOW (1.1x)',
    trustModel: 'Trust hardware vendor',
    useCase: 'Secure computation',
    maturity: 'PRODUCTION',
  },
  ZKP: {
    privacyGuarantee: 'Zero-knowledge',
    performanceImpact: 'MEDIUM (10x)',
    trustModel: 'Trust math',
    useCase: 'Verification without disclosure',
    maturity: 'PRODUCTION',
  },
  HE: {
    privacyGuarantee: 'Computation on encrypted data',
    performanceImpact: 'HIGH (100x)',
    trustModel: 'Trust math',
    useCase: 'Private analytics',
    maturity: 'EMERGING',
  },
  MPC: {
    privacyGuarantee: 'Distributed trust',
    performanceImpact: 'MEDIUM (20x)',
    trustModel: 'Threshold trust',
    useCase: 'Multi-party collaboration',
    maturity: 'PRODUCTION',
  },
  DP: {
    privacyGuarantee: 'Statistical indistinguishability',
    performanceImpact: 'LOW (1.2x)',
    trustModel: 'Trust data curator',
    useCase: 'Public analytics',
    maturity: 'PRODUCTION',
  },
  VC: {
    privacyGuarantee: 'Correctness proof',
    performanceImpact: 'MEDIUM (15x)',
    trustModel: 'Trust math',
    useCase: 'Auditable computation',
    maturity: 'PRODUCTION',
  },
  BLOCKCHAIN_PRIVACY: {
    privacyGuarantee: 'Decentralized privacy',
    performanceImpact: 'HIGH (50x)',
    trustModel: 'Trust network',
    useCase: 'Immutable private records',
    maturity: 'EMERGING',
  },
};

export const UseCaseRecommendations = {
  highFrequencyTrading: {
    recommended: 'classical',
    reason: 'Requires sub-ms latency',
    privacyTech: 'TEE', // Hardware isolation without slowdown
  },
  healthcareDataSharing: {
    recommended: 'quantumResistant',
    reason: 'Long-term data sensitivity',
    privacyTech: 'MPC',
    notes: 'Plan for 100x performance cost',
  },
  IoTDevices: {
    recommended: 'hybrid',
    reason: 'Limited compute resources',
    maxKeySize: '2KB',
    maxSignTime: '30ms',
  },
};

export const BenchmarkEnvironment = {
  hardware: {
    cpu: 'Intel Xeon Gold 6248',
    cores: 20,
    ram: '64GB',
    encryptionAcceleration: 'AES-NI',
  },
  software: {
    os: 'Ubuntu 22.04',
    nodeVersion: '20.x',
    library: 'OpenSSL 3.0 + liboqs',
  },
  timestamp: '2024-01-15T00:00:00Z',
  testIterations: 1000,
  confidenceInterval: '95%',
};