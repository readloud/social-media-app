import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComputationProof } from './entities/computation-proof.entity';
import * as snarkjs from 'snarkjs';
import * as crypto from 'crypto';

@Injectable()
export class VerifiableComputationService {
  private readonly logger = new Logger(VerifiableComputationService.name);
  private provingKey: any;
  private verificationKey: any;

  constructor(
    @InjectRepository(ComputationProof)
    private proofRepository: Repository<ComputationProof>,
  ) {
    this.loadKeys();
  }

  private async loadKeys() {
    this.provingKey = await this.loadProvingKey();
    this.verificationKey = await this.loadVerificationKey();
  }

  // Generate proof for schedule optimization computation
  async generateScheduleOptimizationProof(
    input: OptimizationInput,
    output: OptimizationOutput
  ): Promise<VerifiableProof> {
    // Create circuit witnesses
    const witness = {
      scheduleTimes: input.scheduleTimes,
      userPreferences: input.userPreferences,
      constraints: input.constraints,
      optimalTime: output.optimalTime,
      expectedEngagement: output.expectedEngagement,
    };
    
    // Generate zk-SNARK proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      witness,
      './circuits/schedule_optimization.wasm',
      this.provingKey
    );
    
    const proofId = this.generateProofId();
    
    // Store proof
    const computationProof = this.proofRepository.create({
      proofId,
      computationType: 'SCHEDULE_OPTIMIZATION',
      proof: JSON.stringify(proof),
      publicSignals: JSON.stringify(publicSignals),
      inputHash: this.hashInput(input),
      outputHash: this.hashOutput(output),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });
    
    await this.proofRepository.save(computationProof);
    
    return {
      proofId,
      proof,
      publicSignals,
      verificationKey: this.verificationKey,
    };
  }

  // Verify computation proof
  async verifyComputation(proofId: string): Promise<VerificationResult> {
    const proofRecord = await this.proofRepository.findOne({ where: { proofId } });
    
    if (!proofRecord) {
      return { verified: false, reason: 'Proof not found' };
    }
    
    const proof = JSON.parse(proofRecord.proof);
    const publicSignals = JSON.parse(proofRecord.publicSignals);
    
    // Verify zk-SNARK proof
    const isValid = await snarkjs.groth16.verify(
      this.verificationKey,
      publicSignals,
      proof
    );
    
    if (!isValid) {
      return { verified: false, reason: 'Invalid proof' };
    }
    
    // Check freshness
    if (proofRecord.expiresAt < new Date()) {
      return { verified: false, reason: 'Proof expired' };
    }
    
    return {
      verified: true,
      computationType: proofRecord.computationType,
      verifiedAt: new Date(),
    };
  }

  // Generate proof for batch schedule processing
  async generateBatchProof(
    schedules: ScheduleBatch,
    results: BatchResults
  ): Promise<BatchVerifiableProof> {
    // Recursive proof composition
    const individualProofs = [];
    
    for (let i = 0; i < schedules.length; i++) {
      const proof = await this.generateScheduleProof(schedules[i], results[i]);
      individualProofs.push(proof);
    }
    
    // Aggregate proofs recursively
    const aggregatedProof = await this.aggregateProofs(individualProofs);
    
    return {
      batchId: this.generateBatchId(),
      individualProofCount: individualProofs.length,
      aggregatedProof,
      verificationKey: this.verificationKey,
      timestamp: new Date(),
    };
  }

  // Incremental Verifiable Computation (IVC)
  async incrementalVerification(
    previousState: any,
    newComputation: any
  ): Promise<IVCProof> {
    // Generate proof that new computation is valid given previous state
    const witness = {
      previousStateHash: this.hashState(previousState),
      computation: newComputation,
      nextStateHash: this.hashState(this.applyComputation(previousState, newComputation)),
    };
    
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      witness,
      './circuits/incremental_computation.wasm',
      this.provingKey
    );
    
    return {
      proof,
      publicSignals,
      previousStateHash: witness.previousStateHash,
      nextStateHash: witness.nextStateHash,
      verificationKey: this.verificationKey,
    };
  }

  // Proof-carrying data for schedule pipeline
  async proofCarryingData(
    inputData: any,
    transformation: (data: any) => any
  ): Promise<PipedProof> {
    let currentData = inputData;
    const proofs = [];
    
    // Apply transformations and generate proofs at each step
    for (const step of transformation.steps) {
      const beforeHash = this.hashData(currentData);
      currentData = step.function(currentData);
      const afterHash = this.hashData(currentData);
      
      const proof = await this.generateTransformationProof(
        beforeHash,
        afterHash,
        step.operation
      );
      
      proofs.push(proof);
    }
    
    return {
      finalOutput: currentData,
      proofs,
      verificationKey: this.verificationKey,
    };
  }

  // Verifiable random function for schedule slot assignment
  async verifiableRandomFunction(
    seed: Buffer,
    nonce: number
  ): Promise<VRFResult> {
    // Compute VRF using elliptic curve
    const privateKey = crypto.createPrivateKey(process.env.VRF_PRIVATE_KEY);
    const publicKey = crypto.createPublicKey(privateKey);
    
    const message = Buffer.concat([seed, Buffer.from([nonce])]);
    const signature = crypto.sign(null, message, privateKey);
    
    // Generate proof of correct computation
    const proof = await this.generateVRFProof(message, signature, publicKey);
    
    return {
      output: crypto.createHash('sha256').update(message).digest(),
      proof,
      publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('hex'),
    };
  }

  // Helper methods
  private async generateScheduleProof(schedule: any, result: any): Promise<any> {
    const witness = {
      scheduleTime: schedule.time,
      contentHash: this.hashContent(schedule.content),
      userId: schedule.userId,
      result: result,
    };
    
    return await snarkjs.groth16.fullProve(
      witness,
      './circuits/schedule_verification.wasm',
      this.provingKey
    );
  }

  private async aggregateProofs(proofs: any[]): Promise<any> {
    // Recursive aggregation of proofs
    if (proofs.length === 1) return proofs[0];
    
    const mid = Math.floor(proofs.length / 2);
    const left = await this.aggregateProofs(proofs.slice(0, mid));
    const right = await this.aggregateProofs(proofs.slice(mid));
    
    // Aggregate two proofs into one
    return await this.aggregateTwoProofs(left, right);
  }

  private async aggregateTwoProofs(proof1: any, proof2: any): Promise<any> {
    const witness = {
      proof1: JSON.stringify(proof1),
      proof2: JSON.stringify(proof2),
    };
    
    return await snarkjs.groth16.fullProve(
      witness,
      './circuits/proof_aggregation.wasm',
      this.provingKey
    );
  }

  private async generateTransformationProof(
    beforeHash: string,
    afterHash: string,
    operation: string
  ): Promise<any> {
    const witness = { beforeHash, afterHash, operation };
    return await snarkjs.groth16.fullProve(
      witness,
      './circuits/transformation.wasm',
      this.provingKey
    );
  }

  private async generateVRFProof(
    message: Buffer,
    signature: Buffer,
    publicKey: crypto.KeyObject
  ): Promise<string> {
    // Generate proof that signature is valid for message
    const witness = {
      message: message.toString('hex'),
      signature: signature.toString('hex'),
      publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('hex'),
    };
    
    const { proof } = await snarkjs.groth16.fullProve(
      witness,
      './circuits/vrf_verification.wasm',
      this.provingKey
    );
    
    return JSON.stringify(proof);
  }

  private generateProofId(): string {
    return `proof_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  private hashInput(input: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
  }

  private hashOutput(output: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(output)).digest('hex');
  }

  private hashData(data: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private hashState(state: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
  }

  private applyComputation(state: any, computation: any): any {
    // Apply computation to state
    return { ...state, ...computation };
  }

  private async loadProvingKey(): Promise<any> {
    // Load from secure storage
    return { key: 'proving_key_data' };
  }

  private async loadVerificationKey(): Promise<any> {
    // Load from public storage
    return { key: 'verification_key_data' };
  }
}

interface OptimizationInput {
  scheduleTimes: number[];
  userPreferences: Record<string, any>;
  constraints: any;
}

interface OptimizationOutput {
  optimalTime: number;
  expectedEngagement: number;
}

interface VerifiableProof {
  proofId: string;
  proof: any;
  publicSignals: any;
  verificationKey: any;
}

interface VerificationResult {
  verified: boolean;
  reason?: string;
  computationType?: string;
  verifiedAt?: Date;
}

interface ScheduleBatch {
  schedules: any[];
  timestamp: Date;
}

interface BatchResults {
  results: any[];
}

interface BatchVerifiableProof {
  batchId: string;
  individualProofCount: number;
  aggregatedProof: any;
  verificationKey: any;
  timestamp: Date;
}

interface IVCProof {
  proof: any;
  publicSignals: any;
  previousStateHash: string;
  nextStateHash: string;
  verificationKey: any;
}

interface PipedProof {
  finalOutput: any;
  proofs: any[];
  verificationKey: any;
}

interface VRFResult {
  output: Buffer;
  proof: string;
  publicKey: string;
}