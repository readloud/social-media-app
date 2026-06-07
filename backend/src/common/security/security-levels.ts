export const SecurityLevels = {
  // Classical security (pre-quantum)
  CLASSICAL_256: {
    keyExchange: 'ECDH_P384',
    signature: 'ECDSA_P384',
    encryption: 'AES_256_GCM',
    hash: 'SHA_384',
    securityBits: 256,
    quantumResistant: false,
  },
  
  // Post-quantum transition (hybrid)
  HYBRID_POST_QUANTUM: {
    keyExchange: 'KYBER_1024 + ECDH_P384',
    signature: 'DILITHIUM_5 + ECDSA_P384',
    encryption: 'AES_256_GCM',
    hash: 'SHA3_512',
    securityBits: 384,
    quantumResistant: true,
    nistLevel: 3,
  },
  
  // Full quantum-resistant
  QUANTUM_RESISTANT: {
    keyExchange: 'KYBER_1024',
    signature: 'SPHINCS_PLUS_SHAKE_256f',
    encryption: 'AES_256_GCM',
    hash: 'SHA3_512',
    securityBits: 512,
    quantumResistant: true,
    nistLevel: 5,
    forwardSecrecy: true,
  },
};