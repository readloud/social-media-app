import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsentLog } from './entities/consent-log.entity';

@Injectable()
export class ConsentManagementService {
  constructor(
    @InjectRepository(ConsentLog)
    private consentRepository: Repository<ConsentLog>,
  ) {}

  async recordConsent(userId: string, consentType: ConsentType, granted: boolean): Promise<void> {
    const consent = this.consentRepository.create({
      userId,
      consentType,
      granted,
      ipAddress: this.getClientIp(),
      userAgent: this.getUserAgent(),
      timestamp: new Date(),
    });
    
    await this.consentRepository.save(consent);
  }

  async getConsentStatus(userId: string, consentType: ConsentType): Promise<boolean> {
    const latestConsent = await this.consentRepository.findOne({
      where: { userId, consentType },
      order: { timestamp: 'DESC' },
    });
    
    return latestConsent?.granted || false;
  }

  async withdrawConsent(userId: string, consentType: ConsentType): Promise<void> {
    await this.recordConsent(userId, consentType, false);
    
    // Apply consent withdrawal actions
    switch (consentType) {
      case ConsentType.MARKETING:
        await this.disableMarketingCommunications(userId);
        break;
      case ConsentType.ANALYTICS:
        await this.disableAnalyticsTracking(userId);
        break;
      case ConsentType.THIRD_PARTY_SHARING:
        await this.stopThirdPartySharing(userId);
        break;
    }
  }

  private async disableMarketingCommunications(userId: string): Promise<void> {
    // Implementation to disable marketing emails/notifications
  }

  private async disableAnalyticsTracking(userId: string): Promise<void> {
    // Implementation to disable analytics tracking
  }

  private async stopThirdPartySharing(userId: string): Promise<void> {
    // Implementation to stop sharing data with third parties
  }

  private getClientIp(): string {
    // Get client IP from request context
    return '127.0.0.1';
  }

  private getUserAgent(): string {
    // Get user agent from request context
    return 'unknown';
  }
}

export enum ConsentType {
  MARKETING = 'marketing',
  ANALYTICS = 'analytics',
  THIRD_PARTY_SHARING = 'third_party_sharing',
  ESSENTIAL = 'essential',
}