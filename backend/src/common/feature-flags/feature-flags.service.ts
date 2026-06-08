import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as LaunchDarkly from 'launchdarkly-node-server-sdk';

@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger(FeatureFlagService.name);
  private ldClient: LaunchDarkly.LDClient;

  constructor(private configService: ConfigService) {
    this.initialize();
  }

  private async initialize() {
    const sdkKey = this.configService.get('LAUNCHDARKLY_SDK_KEY');
    if (sdkKey) {
      this.ldClient = await LaunchDarkly.init(sdkKey);
      await this.ldClient.waitForInitialization();
      this.logger.log('LaunchDarkly client initialized');
    }
  }

  async isEnabled(flagName: string, userId: string, context?: any): Promise<boolean> {
    if (!this.ldClient) {
      // Fallback to local config
      return this.getLocalFlagValue(flagName);
    }

    const user = {
      key: userId,
      ...context,
    };

    try {
      const value = await this.ldClient.variation(flagName, user, false);
      this.logger.debug(`Flag ${flagName} = ${value} for user ${userId}`);
      return value;
    } catch (error) {
      this.logger.error(`Failed to evaluate flag ${flagName}: ${error.message}`);
      return this.getLocalFlagValue(flagName);
    }
  }

  async getVariation(flagName: string, userId: string, defaultValue: any): Promise<any> {
    if (!this.ldClient) return defaultValue;

    const user = { key: userId };
    return this.ldClient.variation(flagName, user, defaultValue);
  }

  async trackMetric(flagName: string, userId: string, metricName: string, value: number) {
    if (!this.ldClient) return;

    const event = {
      key: flagName,
      user: { key: userId },
      data: { metricName, value },
    };

    await this.ldClient.track(metricName, event.user, event.data);
  }

  private getLocalFlagValue(flagName: string): boolean {
    const flags = JSON.parse(process.env.LOCAL_FEATURE_FLAGS || '{}');
    return flags[flagName] || false;
  }

  async cleanup() {
    if (this.ldClient) {
      await this.ldClient.flush();
      await this.ldClient.close();
    }
  }
}