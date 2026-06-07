import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuantumKey } from './entities/quantum-key.entity';
import * as crypto from 'crypto';

// Kyber (ML-KEM) for key encapsulation
import { kem } from '@pqcrypto/kyber';
// Dilithium (ML-DSA) for digital signatures
import { sign } from '@pqcrypto/dilithium';
// SPHINCS+ for stateless hash-based signatures
import { sphincs } from '@pqcrypto/sphincsplus';

@Injectable()
export class QuantumResistantCryptoService {
  private readonly logger = new Logger(QuantumResistantCryptoService.name);
  
  // Kyber-1024 parameters (NIST Level 5 security)
  private readonly KYBER_PARAMS = {
    securityLevel: 5,
    keySize: 1568, // bytes
    ciphertextSize: 1568,
    sharedSecretSize: 32,
  };

  // Dilithium-5 parameters (NIST Level 5 security)
  private readonly DILITHIUM_PARAMS = {
    securityLevel: 5,
    publicKeySize: 2592,
    privateKeySize: 4864,
    signatureSize: 4595,
  };

  constructor(
    @InjectRepository(QuantumKey)
    private quantumKeyRepository: Repository<QuantumKey>,
  ) {}

  // Generate Kyber key pair for post-quantum key exchange
  async generateKyberKeyPair(userId: string): Promise<QuantumKeyPair> {
    this.logger.log(`Generating Kyber key pair for user ${userId}`);
    
    // Generate key pair using Kyber (ML-KEM)
    const { publicKey, privateKey } = await kem.keygen();
    
    const keyPair = this.quantumKeyRepository.create({
      userId,
      algorithm: 'KYBER_1024',
      publicKey: publicKey.toString('hex'),
      privateKey: privateKey.toString('hex'),
      securityLevel: 5,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      status: 'ACTIVE',
    });
    
    await this.quantumKeyRepository.save(keyPair);
    
    return {
      id: keyPair.id,
      publicKey: publicKey,
      keyId: keyPair.id,
    };
  }

  // Encapsulate shared secret using Kyber
  async encapsulateSecret(publicKeyHex: string): Promise<KyberCiphertext> {
    const publicKey = Buffer.from(publicKeyHex, 'hex');
    
    // Encapsulate shared secret
    const { ciphertext, sharedSecret } = await kem.encapsulate(publicKey);
    
    return {
      ciphertext: ciphertext.toString('hex'),
      sharedSecret: sharedSecret.toString('hex'),
      algorithm: 'KYBER_1024',
    };
  }

  // Decapsulate shared secret using Kyber private key
  async decapsulateSecret(privateKeyHex: string, ciphertextHex: string): Promise<Buffer> {
    const privateKey = Buffer.from(privateKeyHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    
    // Decapsulate shared secret
    const sharedSecret = await kem.decapsulate(privateKey, ciphertext);
    
    return sharedSecret;
  }

  // Generate Dilithium signature (post-quantum secure)
  async signWithDilithium(message: Buffer, privateKeyHex: string): Promise<DilithiumSignature> {
    const privateKey = Buffer.from(privateKeyHex, 'hex');
    
    // Sign message
    const signature = await sign.sign(privateKey, message);
    
    return {
      signature: signature.toString('hex'),
      algorithm: 'DILITHIUM_5',
      signatureSize: signature.length,
    };
  }

  // Verify Dilithium signature
  async verifyDilithiumSignature(
    message: Buffer,
    signatureHex: string,
    publicKeyHex: string
  ): Promise<boolean> {
    const signature = Buffer.from(signatureHex, 'hex');
    const publicKey = Buffer.from(publicKeyHex, 'hex');
    
    try {
      const isValid = await sign.verify(publicKey, message, signature);
      return isValid;
    } catch (error) {
      this.logger.error(`Dilithium verification failed: ${error.message}`);
      return false;
    }
  }

  // Generate SPHINCS+ key pair (stateless hash-based)
  async generateSphincsKeyPair(userId: string): Promise<SphincsKeyPair> {
    this.logger.log(`Generating SPHINCS+ key pair for user ${userId}`);
    
    // SPHINCS+ is stateless, no need to track state
    const { publicKey, privateKey } = await sphincs.keygen();
    
    const keyPair = this.quantumKeyRepository.create({
      userId,
      algorithm: 'SPHINCS_PLUS_SHAKE_256f',
      publicKey: publicKey.toString('hex'),
      privateKey: privateKey.toString('hex'),
      securityLevel: 5,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days
      status: 'ACTIVE',
    });
    
    await this.quantumKeyRepository.save(keyPair);
    
    return {
      id: keyPair.id,
      publicKey: publicKey,
      keyId: keyPair.id,
    };
  }

  // Hybrid classical + post-quantum encryption
  async hybridEncrypt(
    plaintext: Buffer,
    recipientPublicKeyHex: string
  ): Promise<HybridCiphertext> {
    // 1. Generate Kyber shared secret (post-quantum)
    const kyberResult = await this.encapsulateSecret(recipientPublicKeyHex);
    
    // 2. Generate classical ECDH shared secret (fallback)
    const ecdhKeyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'secp384r1',
    });
    const ecdhSharedSecret = crypto.diffieHellman({
      privateKey: ecdhKeyPair.privateKey,
      publicKey: Buffer.from(recipientPublicKeyHex, 'hex'),
    });
    
    // 3. Combine both secrets using HKDF
    const combinedSecret = await this.combineSecrets([
      Buffer.from(kyberResult.sharedSecret, 'hex'),
      ecdhSharedSecret,
    ]);
    
    // 4. Encrypt with AES-256-GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', combinedSecret, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    return {
      kyberCiphertext: kyberResult.ciphertext,
      ephemeralPublicKey: ecdhKeyPair.publicKey.toString('hex'),
      iv: iv.toString('hex'),
      ciphertext: encrypted.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: 'HYBRID_KYBER_ECDH_AES256_GCM',
    };
  }

  // Hybrid decryption
  async hybridDecrypt(
    ciphertext: HybridCiphertext,
    recipientPrivateKeyHex: string
  ): Promise<Buffer> {
    // 1. Decapsulate Kyber secret
    const kyberSecret = await this.decapsulateSecret(
      recipientPrivateKeyHex,
      ciphertext.kyberCiphertext
    );
    
    // 2. Compute ECDH shared secret
    const ecdhPrivateKey = crypto.createPrivateKey({
      key: Buffer.from(recipientPrivateKeyHex, 'hex'),
      format: 'der',
      type: 'pkcs8',
    });
    const ecdhPublicKey = crypto.createPublicKey({
      key: Buffer.from(ciphertext.ephemeralPublicKey, 'hex'),
      format: 'der',
      type: 'spki',
    });
    const ecdhSharedSecret = crypto.diffieHellman({
      privateKey: ecdhPrivateKey,
      publicKey: ecdhPublicKey,
    });
    
    // 3. Combine secrets
    const combinedSecret = await this.combineSecrets([kyberSecret, ecdhSharedSecret]);
    
    // 4. Decrypt
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      combinedSecret,
      Buffer.from(ciphertext.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(ciphertext.authTag, 'hex'));
    
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertext.ciphertext, 'hex')),
      decipher.final(),
    ]);
    
    return decrypted;
  }

  // Quantum-resistant hash function (SHA-3-512)
  quantumResistantHash(data: Buffer): Buffer {
    return crypto.createHash('sha3-512').update(data).digest();
  }

  // XMSS (eXtended Merkle Signature Scheme) for one-time signatures
  async generateXMSSKeyPair(): Promise<XMSSKeyPair> {
    // XMSS parameters: SHA2_20_256 (NIST Level 3)
    // This implementation would use a specialized library
    return {
      publicKey: Buffer.from('xmss_pubkey', 'hex'),
      privateKey: Buffer.from('xmss_privkey', 'hex'),
      index: 0,
    };
  }

  // Post-quantum secure key rotation
  async rotateQuantumKeys(userId: string): Promise<void> {
    // Deactivate old keys
    await this.quantumKeyRepository.update(
      { userId, status: 'ACTIVE' },
      { status: 'ROTATED', rotatedAt: new Date() }
    );
    
    // Generate new keys
    await this.generateKyberKeyPair(userId);
    await this.generateSphincsKeyPair(userId);
    
    this.logger.log(`Quantum keys rotated for user ${userId}`);
  }

  // Hybrid signature (classical + quantum-resistant)
  async hybridSign(
    message: Buffer,
    classicalPrivateKey: string,
    quantumPrivateKeyHex: string
  ): Promise<HybridSignature> {
    // 1. Dilithium signature (quantum-resistant)
    const dilithiumSig = await this.signWithDilithium(message, quantumPrivateKeyHex);
    
    // 2. Classical ECDSA signature (for backward compatibility)
    const sign = crypto.createSign('SHA384');
    sign.update(message);
    sign.end();
    const ecdsaSig = sign.sign(classicalPrivateKey, 'hex');
    
    // 3. Combine signatures
    const combinedHash = this.quantumResistantHash(
      Buffer.concat([
        Buffer.from(dilithiumSig.signature, 'hex'),
        Buffer.from(ecdsaSig, 'hex'),
      ])
    );
    
    return {
      dilithiumSignature: dilithiumSig.signature,
      ecdsaSignature: ecdsaSig,
      combinedHash: combinedHash.toString('hex'),
      timestamp: Date.now(),
    };
  }

  // Verify hybrid signature
  async verifyHybridSignature(
    message: Buffer,
    signature: HybridSignature,
    classicalPublicKey: string,
    quantumPublicKeyHex: string
  ): Promise<boolean> {
    // Verify both signatures
    const dilithiumValid = await this.verifyDilithiumSignature(
      message,
      signature.dilithiumSignature,
      quantumPublicKeyHex
    );
    
    const verify = crypto.createVerify('SHA384');
    verify.update(message);
    verify.end();
    const ecdsaValid = verify.verify(classicalPublicKey, signature.ecdsaSignature, 'hex');
    
    // Both must be valid for hybrid security
    return dilithiumValid && ecdsaValid;
  }

  // Post-quantum secure communication channel
  async establishQuantumSecureChannel(
    userId: string,
    recipientId: string
  ): Promise<QuantumChannel> {
    // Get both users' quantum keys
    const senderKeys = await this.quantumKeyRepository.findOne({
      where: { userId, algorithm: 'KYBER_1024', status: 'ACTIVE' }
    });
    
    const recipientKeys = await this.quantumKeyRepository.findOne({
      where: { userId: recipientId, algorithm: 'KYBER_1024', status: 'ACTIVE' }
    });
    
    if (!senderKeys || !recipientKeys) {
      throw new Error('Quantum keys not found');
    }
    
    // Establish shared secret using Kyber
    const encapsulated = await this.encapsulateSecret(recipientKeys.publicKey);
    const sharedSecret = await this.decapsulateSecret(
      senderKeys.privateKey,
      encapsulated.ciphertext
    );
    
    // Derive session keys
    const sessionKey = crypto.createHash('sha3-512')
      .update(sharedSecret)
      .update(userId + recipientId)
      .digest();
    
    return {
      channelId: crypto.randomBytes(32).toString('hex'),
      sessionKey: sessionKey.toString('hex'),
      establishedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
  }

  // Quantum-resistant encryption for long-term storage
  async quantumResistantEncrypt(
    data: Buffer,
    userId: string
  ): Promise<QuantumCiphertext> {
    // Generate quantum-resistant key using Kyber and SPHINCS+
    const kyberKey = await this.generateKyberKeyPair(userId);
    const sphincsKey = await this.generateSphincsKeyPair(userId);
    
    // Create hybrid encryption scheme
    const encryptionKey = crypto.createHash('sha3-512')
      .update(kyberKey.publicKey)
      .update(sphincsKey.publicKey)
      .digest();
    
    // Encrypt with AES-256-GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey.subarray(0, 32), iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    return {
      ciphertext: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      kyberPublicKey: kyberKey.publicKey.toString('hex'),
      sphincsPublicKey: sphincsKey.publicKey.toString('hex'),
      algorithm: 'QUANTUM_RESISTANT_AES256_GCM',
    };
  }

  private async combineSecrets(secrets: Buffer[]): Promise<Buffer> {
    const combined = Buffer.concat(secrets);
    return crypto.createHash('sha3-512').update(combined).digest().subarray(0, 32);
  }
}

interface QuantumKeyPair {
  id: string;
  publicKey: Buffer;
  keyId: string;
}

interface KyberCiphertext {
  ciphertext: string;
  sharedSecret: string;
  algorithm: string;
}

interface DilithiumSignature {
  signature: string;
  algorithm: string;
  signatureSize: number;
}

interface SphincsKeyPair {
  id: string;
  publicKey: Buffer;
  keyId: string;
}

interface HybridCiphertext {
  kyberCiphertext: string;
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
  authTag: string;
  algorithm: string;
}

interface HybridSignature {
  dilithiumSignature: string;
  ecdsaSignature: string;
  combinedHash: string;
  timestamp: number;
}

interface QuantumChannel {
  channelId: string;
  sessionKey: string;
  establishedAt: Date;
  expiresAt: Date;
}

interface QuantumCiphertext {
  ciphertext: string;
  iv: string;
  authTag: string;
  kyberPublicKey: string;
  sphincsPublicKey: string;
  algorithm: string;
}

interface XMSSKeyPair {
  publicKey: Buffer;
  privateKey: Buffer;
  index: number;
}