import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ethers } from 'ethers';
import { BlockchainRecord } from './entities/blockchain-record.entity';

@Injectable()
export class BlockchainVerificationService {
  private readonly logger = new Logger(BlockchainVerificationService.name);
  private provider: ethers.providers.JsonRpcProvider;
  private contract: ethers.Contract;
  
  // Smart contract ABI for verification
  private readonly CONTRACT_ABI = [
    'function recordSchedule(string memory scheduleId, string memory hash, uint256 timestamp) public returns (bytes32)',
    'function verifySchedule(string memory scheduleId, string memory hash) public view returns (bool)',
    'event ScheduleRecorded(bytes32 indexed id, string scheduleId, string hash, uint256 timestamp)',
  ];

  constructor(
    @InjectRepository(BlockchainRecord)
    private blockchainRepository: Repository<BlockchainRecord>,
  ) {
    this.initializeBlockchain();
  }

  private async initializeBlockchain() {
    // Connect to blockchain network (Ethereum, BSC, or custom)
    this.provider = new ethers.providers.JsonRpcProvider(
      process.env.BLOCKCHAIN_RPC_URL || 'https://mainnet.infura.io/v3/your-key'
    );
    
    const wallet = new ethers.Wallet(
      process.env.BLOCKCHAIN_PRIVATE_KEY || '',
      this.provider
    );
    
    this.contract = new ethers.Contract(
      process.env.BLOCKCHAIN_CONTRACT_ADDRESS || '',
      this.CONTRACT_ABI,
      wallet
    );
  }

  // Create cryptographic hash of schedule data
  createScheduleHash(schedule: ScheduleData): string {
    const data = JSON.stringify({
      id: schedule.id,
      postContent: schedule.postContent,
      scheduledFor: schedule.scheduledFor,
      userId: schedule.userId,
      mediaHashes: schedule.mediaHashes,
      timestamp: schedule.createdAt,
      platform: schedule.platform,
    });
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // Record schedule on blockchain
  async recordOnBlockchain(schedule: ScheduleData): Promise<BlockchainVerification> {
    this.logger.log(`Recording schedule ${schedule.id} on blockchain`);
    
    const hash = this.createScheduleHash(schedule);
    const timestamp = Math.floor(Date.now() / 1000);
    
    try {
      // Record on blockchain
      const tx = await this.contract.recordSchedule(schedule.id, hash, timestamp);
      const receipt = await tx.wait();
      
      // Store record in local database
      const blockchainRecord = this.blockchainRepository.create({
        scheduleId: schedule.id,
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber,
        transactionHash: receipt.transactionHash,
        dataHash: hash,
        timestamp: new Date(),
        confirmations: 0,
        status: 'PENDING',
      });
      
      await this.blockchainRepository.save(blockchainRecord);
      
      // Wait for confirmations
      this.waitForConfirmations(receipt.transactionHash, blockchainRecord);
      
      return {
        verified: true,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        transactionHash: receipt.transactionHash,
        timestamp: new Date(),
        hash: hash,
      };
    } catch (error) {
      this.logger.error(`Failed to record on blockchain: ${error.message}`);
      throw new Error(`Blockchain recording failed: ${error.message}`);
    }
  }

  // Verify schedule authenticity
  async verifySchedule(scheduleId: string, schedule: ScheduleData): Promise<VerificationResult> {
    const record = await this.blockchainRepository.findOne({
      where: { scheduleId, status: 'CONFIRMED' },
    });
    
    if (!record) {
      return {
        verified: false,
        reason: 'No blockchain record found for this schedule',
        timestamp: new Date(),
      };
    }
    
    // Verify on-chain
    const hash = this.createScheduleHash(schedule);
    const isValid = await this.contract.verifySchedule(scheduleId, hash);
    
    if (!isValid) {
      return {
        verified: false,
        reason: 'Hash mismatch - data has been tampered',
        timestamp: new Date(),
      };
    }
    
    // Verify block existence
    const block = await this.provider.getBlock(record.blockNumber);
    if (!block) {
      return {
        verified: false,
        reason: 'Block not found on blockchain',
        timestamp: new Date(),
      };
    }
    
    return {
      verified: true,
      blockNumber: record.blockNumber,
      blockHash: record.blockHash,
      transactionHash: record.transactionHash,
      timestamp: record.timestamp,
      confirmations: record.confirmations,
    };
  }

  // Batch verification for multiple schedules
  async batchVerifySchedules(schedules: ScheduleData[]): Promise<BatchVerificationResult> {
    const results: BatchVerificationResult = {
      total: schedules.length,
      verified: 0,
      failed: 0,
      pending: 0,
      details: [],
    };
    
    for (const schedule of schedules) {
      try {
        const verification = await this.verifySchedule(schedule.id, schedule);
        results.details.push({
          scheduleId: schedule.id,
          verified: verification.verified,
          reason: verification.verified ? 'Verified' : verification.reason,
        });
        
        if (verification.verified) {
          results.verified++;
        } else {
          results.failed++;
        }
      } catch (error) {
        results.details.push({
          scheduleId: schedule.id,
          verified: false,
          reason: error.message,
        });
        results.failed++;
      }
    }
    
    return results;
  }

  // Wait for blockchain confirmations
  private async waitForConfirmations(txHash: string, record: BlockchainRecord): Promise<void> {
    const requiredConfirmations = parseInt(process.env.BLOCKCHAIN_CONFIRMATIONS || '12');
    let confirmations = 0;
    
    while (confirmations < requiredConfirmations) {
      await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds
      
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (receipt) {
        const currentBlock = await this.provider.getBlockNumber();
        confirmations = currentBlock - receipt.blockNumber;
        record.confirmations = confirmations;
        
        if (confirmations >= requiredConfirmations) {
          record.status = 'CONFIRMED';
          this.logger.log(`Schedule ${record.scheduleId} confirmed with ${confirmations} confirmations`);
        }
        
        await this.blockchainRepository.save(record);
      }
    }
  }

  // Generate proof of publication
  async generateProofOfPublication(scheduleId: string): Promise<ProofOfPublication> {
    const record = await this.blockchainRepository.findOne({
      where: { scheduleId, status: 'CONFIRMED' },
    });
    
    if (!record) {
      throw new Error('No blockchain record found');
    }
    
    // Get block details
    const block = await this.provider.getBlock(record.blockNumber);
    
    // Generate Merkle proof (simplified)
    const proof = {
      scheduleId: scheduleId,
      transactionHash: record.transactionHash,
      blockHash: record.blockHash,
      blockNumber: record.blockNumber,
      blockTimestamp: block.timestamp,
      dataHash: record.dataHash,
      confirmations: record.confirmations,
      merkleRoot: await this.getMerkleRoot(record.blockNumber),
    };
    
    // Sign proof with server private key
    const signature = this.signProof(proof);
    proof.signature = signature;
    
    return proof;
  }

  private async getMerkleRoot(blockNumber: number): Promise<string> {
    const block = await this.provider.getBlock(blockNumber);
    return block.transactionsRoot;
  }

  private signProof(proof: any): string {
    const signer = crypto.createSign('SHA256');
    signer.update(JSON.stringify(proof));
    signer.end();
    return signer.sign(process.env.PRIVATE_KEY || '', 'hex');
  }

  // Create verifiable credential for schedule
  async createVerifiableCredential(schedule: ScheduleData): Promise<VerifiableCredential> {
    const hash = this.createScheduleHash(schedule);
    const blockchainRecord = await this.recordOnBlockchain(schedule);
    
    const credential: VerifiableCredential = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'ScheduleVerification'],
      issuer: process.env.DID || 'did:example:socialmediaapp',
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: schedule.id,
        hash: hash,
        scheduledFor: schedule.scheduledFor,
        blockchainReference: {
          transactionHash: blockchainRecord.transactionHash,
          blockNumber: blockchainRecord.blockNumber,
        },
      },
      proof: {
        type: 'Ed25519Signature2018',
        created: new Date().toISOString(),
        verificationMethod: `${process.env.DID}#keys-1`,
        proofPurpose: 'assertionMethod',
        jws: this.generateJWS(hash),
      },
    };
    
    return credential;
  }

  private generateJWS(data: string): string {
    // Implement JWS generation
    return crypto.createHmac('sha256', process.env.JWT_SECRET || '')
      .update(data)
      .digest('hex');
  }
}

interface ScheduleData {
  id: string;
  postContent: string;
  scheduledFor: string;
  userId: string;
  mediaHashes: string[];
  createdAt: string;
  platform: string;
}

interface BlockchainVerification {
  verified: boolean;
  blockNumber?: number;
  blockHash?: string;
  transactionHash?: string;
  timestamp?: Date;
  hash?: string;
}

interface VerificationResult {
  verified: boolean;
  reason?: string;
  blockNumber?: number;
  blockHash?: string;
  transactionHash?: string;
  timestamp?: Date;
  confirmations?: number;
}

interface BatchVerificationResult {
  total: number;
  verified: number;
  failed: number;
  pending: number;
  details: Array<{
    scheduleId: string;
    verified: boolean;
    reason?: string;
  }>;
}

interface ProofOfPublication {
  scheduleId: string;
  transactionHash: string;
  blockHash: string;
  blockNumber: number;
  blockTimestamp: number;
  dataHash: string;
  confirmations: number;
  merkleRoot: string;
  signature?: string;
}

interface VerifiableCredential {
  '@context': string[];
  type: string[];
  issuer: string;
  issuanceDate: string;
  credentialSubject: any;
  proof: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    jws: string;
  };
}