import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/users/user.entity';
import { Post } from '../../modules/posts/post.entity';

@Injectable()
export class GDPRComplianceService {
  private readonly logger = new Logger(GDPRComplianceService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
  ) {}

  // Right to be Forgotten (Article 17)
  async deleteUserData(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      throw new Error('User not found');
    }

    // Anonymize user data instead of hard delete for audit purposes
    user.email = `deleted_${Date.now()}@anonymized.com`;
    user.username = `deleted_user_${Date.now()}`;
    user.passwordHash = '[DELETED]';
    user.fullName = 'Deleted User';
    user.avatarUrl = null;
    user.bio = '[Content removed due to GDPR request]';
    user.isActive = false;
    
    await this.userRepository.save(user);
    
    // Anonymize user's posts
    await this.postRepository.update(
      { userId },
      {
        content: '[Content removed due to GDPR request]',
        status: 'deleted',
      }
    );
    
    this.logger.log(`GDPR: User data deleted for ${userId}`);
  }

  // Right to Access (Article 15)
  async exportUserData(userId: string): Promise<GDPRDataExport> {
    const user = await this.userRepository.findOne({ 
      where: { id: userId },
      relations: ['posts', 'scheduledPosts'],
    });
    
    if (!user) {
      throw new Error('User not found');
    }

    const exportData: GDPRDataExport = {
      userId: user.id,
      exportDate: new Date().toISOString(),
      personalData: {
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        bio: user.bio,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
      posts: user.posts.map(post => ({
        id: post.id,
        content: post.content,
        createdAt: post.createdAt,
        status: post.status,
      })),
      scheduledPosts: user.scheduledPosts.map(schedule => ({
        id: schedule.id,
        scheduledFor: schedule.scheduledFor,
        status: schedule.status,
        createdAt: schedule.createdAt,
      })),
      metadata: {
        exportFormat: 'json',
        dataRetentionPeriod: '30 days',
        complianceStandard: 'GDPR',
      },
    };
    
    this.logger.log(`GDPR: Data exported for ${userId}`);
    return exportData;
  }

  // Right to Rectification (Article 16)
  async rectifyUserData(userId: string, updates: Partial<User>): Promise<void> {
    const allowedUpdates = ['email', 'fullName', 'bio'];
    const filteredUpdates = {};
    
    for (const key of allowedUpdates) {
      if (updates[key]) {
        filteredUpdates[key] = updates[key];
      }
    }
    
    await this.userRepository.update(userId, filteredUpdates);
    this.logger.log(`GDPR: Data rectified for ${userId}`);
  }

  // Right to Restrict Processing (Article 18)
  async restrictProcessing(userId: string): Promise<void> {
    await this.userRepository.update(userId, { isActive: false });
    this.logger.log(`GDPR: Processing restricted for ${userId}`);
  }

  // Data Portability (Article 20)
  async exportPortableData(userId: string): Promise<Buffer> {
    const data = await this.exportUserData(userId);
    const jsonData = JSON.stringify(data, null, 2);
    
    // Create JSON file for download
    return Buffer.from(jsonData, 'utf-8');
  }
}

interface GDPRDataExport {
  userId: string;
  exportDate: string;
  personalData: any;
  posts: any[];
  scheduledPosts: any[];
  metadata: any;
}