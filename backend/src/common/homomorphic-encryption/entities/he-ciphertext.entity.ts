import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('he_ciphertexts')
export class HECiphertext {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  scheduleId: string;

  @Column({ type: 'jsonb' })
  encryptedData: any;

  @Column()
  encryptionType: string;

  @Column({ default: 8192 })
  polyModulusDegree: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  expiresAt: Date;
}