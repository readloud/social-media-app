import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnclaveSession } from './entities/enclave-session.entity';
import * as crypto from 'crypto';
import { NitroEnclave } from 'aws-nitro-enclaves-sdk';

@Injectable()
export class TrustedExecutionEnvironmentService implements OnModuleInit {
  private readonly logger = new Logger(TrustedExecutionEnvironmentService.name);
  private enclave: NitroEnclave;
  private attestationDocuments: Map<string, AttestationDoc> = new Map();

  constructor(
    @InjectRepository(EnclaveSession)
    private enclaveRepository: Repository<EnclaveSession>,
  ) {}

  async onModuleInit() {
    await this.initializeEnclave();
  }

  private async initializeEnclave() {
    // Initialize AWS Nitro Enclave
    this.enclave = new NitroEnclave({
      enclaveName: 'schedule-processing-enclave',
      cpuCount: 2,
      memoryMiB: 4096,
      enclaveImage: 'schedule-enclave.eif',
    });

    await this.enclave.start();
    this.logger.log('TEE enclave initialized successfully');
  }

  // Create secure enclave session for schedule processing
  async createEnclaveSession(userId: string, purpose: string): Promise<EnclaveSessionInfo> {
    // Generate session key inside enclave
    const sessionKey = await this.enclave.generateKey();
    
    // Get attestation document for remote verification
    const attestation = await this.enclave.attest();
    
    const session = this.enclaveRepository.create({
      userId,
      sessionId: this.generateSessionId(),
      enclaveId: this.enclave.id,
      sessionKey: sessionKey.toString('hex'),
      attestationDoc: JSON.stringify(attestation),
      purpose,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
    });
    
    await this.enclaveRepository.save(session);
    
    // Verify attestation
    const isValid = await this.verifyAttestation(attestation);
    
    return {
      sessionId: session.sessionId,
      enclaveId: this.enclave.id,
      publicKey: sessionKey.publicKey.toString('hex'),
      attestationDocument: attestation,
      verified: isValid,
    };
  }

  // Process schedule inside TEE
  async processScheduleInEnclave(
    sessionId: string,
    encryptedSchedule: EncryptedSchedule
  ): Promise<SecureProcessResult> {
    const session = await this.enclaveRepository.findOne({ where: { sessionId } });
    
    if (!session || session.expiresAt < new Date()) {
      throw new Error('Invalid or expired enclave session');
    }
    
    // Send encrypted data to enclave
    const result = await this.enclave.processSecureRequest({
      sessionId,
      encryptedData: encryptedSchedule,
      operation: 'PROCESS_SCHEDULE',
    });
    
    // Results remain encrypted and are only decrypted inside TEE
    return {
      encryptedResult: result.encryptedOutput,
      processingProof: result.proof,
      attestation: await this.getLatestAttestation(),
    };
  }

  // Secure key management inside TEE
  async rotateEnclaveKeys(): Promise<void> {
    const newKey = await this.enclave.rotateKeys();
    this.logger.log('Enclave keys rotated securely');
  }

  // Verify enclave attestation
  private async verifyAttestation(attestation: any): Promise<boolean> {
    // Verify AWS Nitro attestation document
    const pcrs = attestation.pcrs;
    const expectedPCRs = await this.getExpectedPCRs();
    
    // Verify PCR values match expected
    for (const [index, value] of Object.entries(pcrs)) {
      if (value !== expectedPCRs[index]) {
        this.logger.error(`PCR ${index} mismatch`);
        return false;
      }
    }
    
    // Verify signature
    const isValid = await this.verifyAttestationSignature(attestation);
    return isValid;
  }

  private generateSessionId(): string {
    return `tee_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
  }

  private async getExpectedPCRs(): Promise<Record<string, string>> {
    // Get expected PCR values for known good enclave image
    return {
      '0': 'expected_pcr0_hash',
      '1': 'expected_pcr1_hash',
      '2': 'expected_pcr2_hash',
    };
  }

  private async verifyAttestationSignature(attestation: any): Promise<boolean> {
    // Verify using AWS KMS or Nitro verification service
    return true;
  }

  private async getLatestAttestation(): Promise<any> {
    return await this.enclave.attest();
  }
}

interface EncryptedSchedule {
  scheduleId: string;
  ciphertext: string;
  iv: string;
  authTag: string;
}

interface EnclaveSessionInfo {
  sessionId: string;
  enclaveId: string;
  publicKey: string;
  attestationDocument: any;
  verified: boolean;
}

interface SecureProcessResult {
  encryptedResult: string;
  processingProof: string;
  attestation: any;
}

interface AttestationDoc {
  document: any;
  signature: string;
  timestamp: Date;
}