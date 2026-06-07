import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from '../users/user.entity';
import { ScheduledPost } from '../schedule/scheduled-post.entity';

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ default: 'draft' })
  status: string; // draft, published, failed, deleted

  @Column({ nullable: true })
  publishedAt: Date;

  @Column({ type: 'jsonb', default: [] })
  mediaUrls: string[];

  @Column({ type: 'jsonb', default: [] })
  mediaPublicIds: string[];

  @ManyToOne(() => User, user => user.posts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ScheduledPost, scheduled => scheduled.post)
  scheduledPosts: ScheduledPost[];
}