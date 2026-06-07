import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('anomaly_logs')
@Index(['userId', 'detectedAt'])
@Index(['anomalyType', 'severity'])
export class AnomalyLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  scheduleId: string;

  @Column()
  userId: string;

  @Column()
  anomalyType: string;

  @Column()
  severity: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'float', default: 0 })
  score: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @Column({ default: 'OPEN' })
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'FALSE_POSITIVE';

  @CreateDateColumn()
  detectedAt: Date;

  @Column({ nullable: true })
  resolvedAt: Date;

  @Column({ nullable: true })
  resolvedBy: string;

  @Column({ type: 'text', nullable: true })
  resolutionNote: string;
}