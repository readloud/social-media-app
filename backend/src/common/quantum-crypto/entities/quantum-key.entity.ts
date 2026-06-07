import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('quantum_keys')
@Index(['userId', 'status'])
@Index(['algorithm', 'createdAt'])
export class QuantumKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  algorithm: string; // 'KYBER_1024', 'DILITHIUM_5', 'SPHINCS_PLUS', 'XMSS'

  @Column({ type: 'text' })
  publicKey: string;

  @Column({ type: 'text' })
  privateKey: string; // Encrypted at rest

  @Column({ default: 5 })
  securityLevel: number; // NIST security level 1-5

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ default: 'ACTIVE' })
  status: 'ACTIVE' | 'ROTATED' | 'REVOKED' | 'EXPIRED';

  @Column({ nullable: true })
  rotatedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;
}