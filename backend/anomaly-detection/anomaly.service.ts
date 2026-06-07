import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Between } from 'typeorm';
import * as tf from '@tensorflow/tfjs-node';
import { AnomalyLog } from './entities/anomaly-log.entity';
import { ScheduledPost } from '../../modules/schedule/scheduled-post.entity';

@Injectable()
export class AnomalyDetectionService implements OnModuleInit {
  private readonly logger = new Logger(AnomalyDetectionService.name);
  private model: tf.LayersModel;
  private anomalyThresholds: Map<string, number> = new Map();

  constructor(
    @InjectRepository(AnomalyLog)
    private anomalyRepository: Repository<AnomalyLog>,
    @InjectRepository(ScheduledPost)
    private scheduleRepository: Repository<ScheduledPost>,
  ) {}

  async onModuleInit() {
    await this.loadOrCreateModel();
    this.startContinuousMonitoring();
    this.initializeThresholds();
  }

  private async loadOrCreateModel() {
    try {
      // Try to load existing model
      this.model = await tf.loadLayersModel('file://./models/anomaly-detection/model.json');
      this.logger.log('Loaded existing anomaly detection model');
    } catch (error) {
      // Create new model if none exists
      this.model = this.createModel();
      await this.trainModel();
      this.logger.log('Created and trained new anomaly detection model');
    }
  }

  private createModel(): tf.LayersModel {
    const model = tf.sequential();
    
    // LSTM autoencoder for sequence anomaly detection
    model.add(tf.layers.lstm({
      units: 64,
      inputShape: [24, 10], // 24 hours of 10 features
      returnSequences: true,
    }));
    
    model.add(tf.layers.lstm({
      units: 32,
      returnSequences: true,
    }));
    
    model.add(tf.layers.lstm({
      units: 16,
      returnSequences: false,
    }));
    
    model.add(tf.layers.dense({ units: 10 }));
    model.add(tf.layers.dense({ units: 10 }));
    
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['accuracy'],
    });
    
    return model;
  }

  private async trainModel() {
    // Collect historical data for training
    const historicalData = await this.collectHistoricalData(90); // Last 90 days
    
    // Prepare training data
    const { features, labels } = this.prepareTrainingData(historicalData);
    
    const xs = tf.tensor3d(features);
    const ys = tf.tensor2d(labels);
    
    // Train model
    await this.model.fit(xs, ys, {
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          this.logger.debug(`Epoch ${epoch}: loss = ${logs.loss}`);
        },
      },
    });
    
    // Save model
    await this.model.save('file://./models/anomaly-detection');
  }

  // Real-time anomaly detection
  async detectAnomalies(scheduleData: ScheduleMetrics): Promise<AnomalyDetectionResult> {
    const anomalies: DetectedAnomaly[] = [];
    
    // 1. Behavioral anomaly detection
    const behavioralAnomaly = await this.detectBehavioralAnomaly(scheduleData);
    if (behavioralAnomaly) anomalies.push(behavioralAnomaly);
    
    // 2. Temporal pattern anomaly
    const temporalAnomaly = await this.detectTemporalAnomaly(scheduleData);
    if (temporalAnomaly) anomalies.push(temporalAnomaly);
    
    // 3. Rate-based anomaly
    const rateAnomaly = await this.detectRateAnomaly(scheduleData);
    if (rateAnomaly) anomalies.push(rateAnomaly);
    
    // 4. ML-based anomaly detection
    const mlAnomaly = await this.detectMLAnomaly(scheduleData);
    if (mlAnomaly) anomalies.push(mlAnomaly);
    
    // 5. User behavior profiling
    const userBehaviorAnomaly = await this.detectUserBehaviorAnomaly(scheduleData);
    if (userBehaviorAnomaly) anomalies.push(userBehaviorAnomaly);
    
    // 6. Content-based anomaly detection
    const contentAnomaly = await this.detectContentAnomaly(scheduleData);
    if (contentAnomaly) anomalies.push(contentAnomaly);
    
    // Log anomalies
    if (anomalies.length > 0) {
      await this.logAnomalies(scheduleData, anomalies);
    }
    
    return {
      hasAnomaly: anomalies.length > 0,
      anomalies: anomalies,
      riskScore: this.calculateRiskScore(anomalies),
      recommendedAction: this.determineAction(anomalies),
    };
  }

  private async detectBehavioralAnomaly(data: ScheduleMetrics): Promise<DetectedAnomaly | null> {
    // Get user's historical behavior patterns
    const userHistory = await this.getUserHistory(data.userId, 30); // Last 30 days
    
    // Calculate deviation from normal behavior
    const avgSchedulesPerDay = userHistory.avgSchedulesPerDay;
    const stdDevSchedules = userHistory.stdDevSchedules;
    
    const currentSchedules = data.schedulesInLastHour;
    const zScore = (currentSchedules - avgSchedulesPerDay) / (stdDevSchedules || 1);
    
    if (zScore > 3) {
      return {
        type: 'BEHAVIORAL',
        severity: zScore > 5 ? 'HIGH' : 'MEDIUM',
        description: `Unusual schedule volume: ${currentSchedules} schedules in last hour (normal: ${avgSchedulesPerDay.toFixed(2)} ± ${stdDevSchedules.toFixed(2)})`,
        score: zScore,
        timestamp: new Date(),
      };
    }
    
    return null;
  }

  private async detectTemporalAnomaly(data: ScheduleMetrics): Promise<DetectedAnomaly | null> {
    // Check for unusual scheduling times
    const hour = new Date(data.currentTime).getHours();
    const dayOfWeek = new Date(data.currentTime).getDay();
    
    // Get typical schedule times for this user
    const userPattern = await this.getUserTimePattern(data.userId);
    
    // Check if scheduling at unusual hour (e.g., 3 AM for non-night-owl users)
    const isUnusualHour = !userPattern.activeHours.includes(hour);
    const isUnusualDay = !userPattern.activeDays.includes(dayOfWeek);
    
    if (isUnusualHour && isUnusualDay) {
      const severity = (hour >= 0 && hour <= 5) ? 'HIGH' : 'MEDIUM';
      return {
        type: 'TEMPORAL',
        severity,
        description: `Unusual scheduling time: ${hour}:00 on ${this.getDayName(dayOfWeek)}`,
        score: 0.8,
        timestamp: new Date(),
      };
    }
    
    return null;
  }

  private async detectRateAnomaly(data: ScheduleMetrics): Promise<DetectedAnomaly | null> {
    // Monitor schedule creation rate
    const recentRate = await this.getRecentScheduleRate(data.userId, 5); // Last 5 minutes
    const globalRate = await this.getGlobalAverageRate();
    
    const rateRatio = recentRate / globalRate;
    
    if (rateRatio > 10) {
      return {
        type: 'RATE',
        severity: 'HIGH',
        description: `Extreme schedule rate: ${recentRate.toFixed(2)}/min (global avg: ${globalRate.toFixed(2)}/min)`,
        score: Math.min(1.0, rateRatio / 20),
        timestamp: new Date(),
      };
    }
    
    if (rateRatio > 5) {
      return {
        type: 'RATE',
        severity: 'MEDIUM',
        description: `High schedule rate: ${recentRate.toFixed(2)}/min (global avg: ${globalRate.toFixed(2)}/min)`,
        score: rateRatio / 10,
        timestamp: new Date(),
      };
    }
    
    return null;
  }

  private async detectMLAnomaly(data: ScheduleMetrics): Promise<DetectedAnomaly | null> {
    // Extract features for ML model
    const features = this.extractFeatures(data);
    const inputTensor = tf.tensor2d([features]);
    
    // Get model prediction
    const prediction = this.model.predict(inputTensor) as tf.Tensor;
    const reconstructionError = await this.calculateReconstructionError(prediction, inputTensor);
    
    const threshold = this.anomalyThresholds.get('ml_threshold') || 0.1;
    
    if (reconstructionError > threshold) {
      const severity = reconstructionError > threshold * 2 ? 'HIGH' : 'MEDIUM';
      return {
        type: 'ML_DETECTION',
        severity,
        description: `ML model detected anomalous pattern (error: ${reconstructionError.toFixed(4)})`,
        score: Math.min(1.0, reconstructionError / threshold),
        timestamp: new Date(),
      };
    }
    
    return null;
  }

  private async detectUserBehaviorAnomaly(data: ScheduleMetrics): Promise<DetectedAnomaly | null> {
    // Detect account takeover via behavior analysis
    const userProfile = await this.getUserBehaviorProfile(data.userId);
    
    const anomalies = [];
    
    // Check typing pattern (if implemented)
    if (data.typingSpeed && Math.abs(data.typingSpeed - userProfile.avgTypingSpeed) > userProfile.stdTypingSpeed * 2) {
      anomalies.push('Unusual typing pattern');
    }
    
    // Check device fingerprint
    if (data.deviceFingerprint && !userProfile.knownDevices.includes(data.deviceFingerprint)) {
      anomalies.push('New device detected');
    }
    
    // Check location anomaly
    if (data.location && !this.isLocationPlausible(data.location, userProfile.usualLocations)) {
      anomalies.push('Suspicious location');
    }
    
    // Check interaction pattern
    if (data.interactionSpeed && data.interactionSpeed > userProfile.avgInteractionSpeed * 3) {
      anomalies.push('Unusually fast interactions (bot-like behavior)');
    }
    
    if (anomalies.length > 0) {
      return {
        type: 'USER_BEHAVIOR',
        severity: anomalies.length >= 2 ? 'HIGH' : 'MEDIUM',
        description: anomalies.join('; '),
        score: Math.min(1.0, anomalies.length / 3),
        timestamp: new Date(),
      };
    }
    
    return null;
  }

  private async detectContentAnomaly(data: ScheduleMetrics): Promise<DetectedAnomaly | null> {
    // Analyze content for malicious patterns
    const content = data.postContent;
    
    const anomalies = [];
    
    // Check for malicious URLs
    const urlPattern = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
    const urls = content.match(urlPattern) || [];
    
    for (const url of urls) {
      const isMalicious = await this.checkMaliciousURL(url);
      if (isMalicious) {
        anomalies.push(`Malicious URL detected: ${url}`);
      }
    }
    
    // Check for spam patterns
    const spamScore = this.calculateSpamScore(content);
    if (spamScore > 0.8) {
      anomalies.push(`High spam score: ${spamScore}`);
    }
    
    // Check for duplicate content across multiple accounts
    const similarPosts = await this.findSimilarPosts(content);
    if (similarPosts > 10) {
      anomalies.push(`Content appears in ${similarPosts} other posts (potential spam campaign)`);
    }
    
    // Check for prohibited keywords
    const prohibitedKeywords = await this.checkProhibitedKeywords(content);
    if (prohibitedKeywords.length > 0) {
      anomalies.push(`Contains prohibited content: ${prohibitedKeywords.join(', ')}`);
    }
    
    if (anomalies.length > 0) {
      const severity = anomalies.some(a => a.includes('malicious')) ? 'CRITICAL' : 'MEDIUM';
      return {
        type: 'CONTENT',
        severity,
        description: anomalies.join('; '),
        score: Math.min(1.0, spamScore),
        timestamp: new Date(),
      };
    }
    
    return null;
  }

  // Network anomaly detection (for auto-schedule endpoints)
  async detectNetworkAnomaly(requestData: NetworkRequestData): Promise<DetectedAnomaly | null> {
    const anomalies = [];
    
    // Check request rate from IP
    const ipRate = await this.getIPRequestRate(requestData.ip);
    if (ipRate > 100) { // More than 100 requests per minute
      anomalies.push(`High request rate from IP: ${ipRate}/min`);
    }
    
    // Check for distributed attacks
    const similarPatterns = await this.findSimilarRequestPatterns(requestData);
    if (similarPatterns > 50) {
      anomalies.push(`Distributed attack pattern detected (${similarPatterns} similar requests)`);
    }
    
    // Check payload size anomaly
    const avgPayloadSize = await this.getAveragePayloadSize();
    if (requestData.payloadSize > avgPayloadSize * 5) {
      anomalies.push(`Abnormally large payload: ${requestData.payloadSize} bytes`);
    }
    
    if (anomalies.length > 0) {
      return {
        type: 'NETWORK',
        severity: anomalies.length >= 2 ? 'HIGH' : 'MEDIUM',
        description: anomalies.join('; '),
        score: Math.min(1.0, ipRate / 200),
        timestamp: new Date(),
      };
    }
    
    return null;
  }

  // Continuous monitoring for auto-schedule system
  private startContinuousMonitoring() {
    setInterval(async () => {
      await this.monitorSystemHealth();
      await this.detectScheduleFailures();
      await this.detectQueueAnomalies();
      await this.updateAnomalyThresholds();
    }, 60000); // Every minute
  }

  private async monitorSystemHealth() {
    const metrics = await this.getSystemMetrics();
    const anomalies = [];
    
    // Check queue accumulation
    if (metrics.queueDepth > 10000) {
      anomalies.push({
        type: 'SYSTEM',
        severity: 'HIGH',
        description: `Queue depth critical: ${metrics.queueDepth} pending jobs`,
      });
    }
    
    // Check processing latency
    if (metrics.avgProcessingLatency > 60000) { // 1 minute
      anomalies.push({
        type: 'SYSTEM',
        severity: 'HIGH',
        description: `High processing latency: ${metrics.avgProcessingLatency}ms`,
      });
    }
    
    // Check failure rate spike
    const failureRate = await this.getRecentFailureRate(5); // Last 5 minutes
    if (failureRate > 0.2) { // 20% failure rate
      anomalies.push({
        type: 'SYSTEM',
        severity: 'CRITICAL',
        description: `Failure rate spike: ${(failureRate * 100).toFixed(2)}%`,
      });
    }
    
    if (anomalies.length > 0) {
      await this.alertSystemAnomalies(anomalies);
    }
  }

  private async detectScheduleFailures() {
    // Predict potential failures before they happen
    const pendingSchedules = await this.scheduleRepository.find({
      where: { status: 'pending', scheduledFor: MoreThan(new Date()) },
      take: 1000,
    });
    
    for (const schedule of pendingSchedules) {
      const failureRisk = await this.predictFailureRisk(schedule);
      
      if (failureRisk > 0.8) {
        await this.proactiveScheduleMitigation(schedule, failureRisk);
      }
    }
  }

  private async predictFailureRisk(schedule: ScheduledPost): Promise<number> {
    // ML-based failure prediction
    const features = {
      scheduledHour: new Date(schedule.scheduledFor).getHours(),
      dayOfWeek: new Date(schedule.scheduledFor).getDay(),
      retryCount: schedule.retryCount,
      platform: schedule.platform,
      mediaCount: schedule.mediaUrls?.length || 0,
      userHistory: await this.getUserSuccessRate(schedule.userId),
      systemLoad: await this.getSystemLoadScore(),
    };
    
    // Simplified risk calculation
    let risk = 0;
    if (features.scheduledHour >= 22 || features.scheduledHour <= 5) risk += 0.1; // Off-peak hours
    if (features.retryCount > 0) risk += 0.2 * features.retryCount;
    if (features.systemLoad > 0.7) risk += 0.3;
    if (features.userHistory.successRate < 0.8) risk += 0.2;
    if (features.mediaCount > 5) risk += 0.1;
    
    return Math.min(1.0, risk);
  }

  private async proactiveScheduleMitigation(schedule: ScheduledPost, risk: number): Promise<void> {
    this.logger.warn(`High failure risk (${risk}) for schedule ${schedule.id}, taking preventive action`);
    
    // Actions based on risk level
    if (risk > 0.9) {
      // Add to high-priority monitoring
      await this.addToWatchlist(schedule);
      // Notify admin
      await this.notifyHighRiskSchedule(schedule);
    } else if (risk > 0.8) {
      // Pre-warm cache for this schedule
      await this.preWarmScheduleResources(schedule);
      // Increase retry attempts
      await this.increaseRetryLimit(schedule);
    }
  }

  private async detectQueueAnomalies() {
    const queueMetrics = await this.getQueueMetrics();
    
    // Detect stuck jobs
    const stuckJobs = queueMetrics.jobs.filter(job => 
      job.status === 'active' && 
      (Date.now() - job.timestamp) > 300000 // 5 minutes
    );
    
    if (stuckJobs.length > 0) {
      await this.handleStuckJobs(stuckJobs);
    }
    
    // Detect job processing pattern anomalies
    const processingPattern = await this.analyzeProcessingPattern();
    if (processingPattern.isAbnormal) {
      await this.adjustProcessingStrategy(processingPattern);
    }
  }

  private async logAnomalies(data: ScheduleMetrics, anomalies: DetectedAnomaly[]): Promise<void> {
    for (const anomaly of anomalies) {
      const log = this.anomalyRepository.create({
        scheduleId: data.scheduleId,
        userId: data.userId,
        anomalyType: anomaly.type,
        severity: anomaly.severity,
        description: anomaly.description,
        score: anomaly.score,
        metadata: {
          schedulesInLastHour: data.schedulesInLastHour,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
        detectedAt: new Date(),
        status: 'OPEN',
      });
      
      await this.anomalyRepository.save(log);
      
      // Trigger auto-response for critical anomalies
      if (anomaly.severity === 'CRITICAL' || anomaly.score > 0.9) {
        await this.autoRespondToAnomaly(anomaly, data);
      }
    }
  }

  private async autoRespondToAnomaly(anomaly: DetectedAnomaly, data: ScheduleMetrics): Promise<void> {
    this.logger.warn(`Auto-responding to critical anomaly: ${anomaly.type}`);
    
    switch (anomaly.type) {
      case 'RATE':
        // Temporarily rate limit the user
        await this.tempRateLimitUser(data.userId, 60); // 60 minutes
        break;
      case 'CONTENT':
        // Block the schedule
        await this.blockSchedule(data.scheduleId, anomaly.description);
        break;
      case 'USER_BEHAVIOR':
        // Force re-authentication
        await this.forceReauthentication(data.userId);
        break;
      case 'NETWORK':
        // Block IP temporarily
        await this.tempBlockIP(data.ipAddress, 30); // 30 minutes
        break;
    }
    
    // Send alert to security team
    await this.sendSecurityAlert(anomaly, data);
  }

  // Dashboard for anomaly metrics
  async getAnomalyDashboard(): Promise<AnomalyDashboard> {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const anomalies = await this.anomalyRepository.find({
      where: { detectedAt: MoreThan(last24h) },
    });
    
    const dashboard: AnomalyDashboard = {
      totalAnomalies: anomalies.length,
      byType: {},
      bySeverity: {
        CRITICAL: anomalies.filter(a => a.severity === 'CRITICAL').length,
        HIGH: anomalies.filter(a => a.severity === 'HIGH').length,
        MEDIUM: anomalies.filter(a => a.severity === 'MEDIUM').length,
        LOW: anomalies.filter(a => a.severity === 'LOW').length,
      },
      topUsers: await this.getTopAnomalyUsers(10),
      systemHealth: await this.getSystemHealth(),
      mlModelAccuracy: await this.getModelAccuracy(),
      recentAlerts: await this.getRecentAlerts(20),
    };
    
    // Calculate by type
    for (const type of ['BEHAVIORAL', 'TEMPORAL', 'RATE', 'ML_DETECTION', 'USER_BEHAVIOR', 'CONTENT', 'NETWORK']) {
      dashboard.byType[type] = anomalies.filter(a => a.anomalyType === type).length;
    }
    
    return dashboard;
  }

  private calculateRiskScore(anomalies: DetectedAnomaly[]): number {
    if (anomalies.length === 0) return 0;
    
    let score = 0;
    for (const anomaly of anomalies) {
      const severityWeight = {
        CRITICAL: 1.0,
        HIGH: 0.7,
        MEDIUM: 0.4,
        LOW: 0.2,
      };
      score += anomaly.score * severityWeight[anomaly.severity];
    }
    
    return Math.min(1.0, score / anomalies.length);
  }

  private determineAction(anomalies: DetectedAnomaly[]): string {
    const hasCritical = anomalies.some(a => a.severity === 'CRITICAL');
    const hasHigh = anomalies.some(a => a.severity === 'HIGH');
    const avgScore = this.calculateRiskScore(anomalies);
    
    if (hasCritical && avgScore > 0.8) {
      return 'BLOCK_SCHEDULE_AND_ALERT_ADMIN';
    } else if (hasHigh && avgScore > 0.6) {
      return 'REQUIRE_ADDITIONAL_VERIFICATION';
    } else if (avgScore > 0.4) {
      return 'LOG_AND_MONITOR';
    } else {
      return 'ALLOW';
    }
  }

  // Helper methods (mock implementations)
  private async getUserHistory(userId: string, days: number): Promise<any> { return { avgSchedulesPerDay: 10, stdDevSchedules: 3 }; }
  private async getUserTimePattern(userId: string): Promise<any> { return { activeHours: [9, 10, 11, 12, 13, 14, 15, 16, 17], activeDays: [1, 2, 3, 4, 5] }; }
  private getDayName(day: number): string { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]; }
  private async getRecentScheduleRate(userId: string, minutes: number): Promise<number> { return 15; }
  private async getGlobalAverageRate(): Promise<number> { return 5; }
  private extractFeatures(data: ScheduleMetrics): number[] { return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; }
  private async calculateReconstructionError(prediction: tf.Tensor, input: tf.Tensor): Promise<number> { return 0.05; }
  private async getUserBehaviorProfile(userId: string): Promise<any> { return { avgTypingSpeed: 60, stdTypingSpeed: 10, knownDevices: [], usualLocations: [], avgInteractionSpeed: 2000 }; }
  private isLocationPlausible(location: string, usualLocations: string[]): boolean { return true; }
  private async checkMaliciousURL(url: string): Promise<boolean> { return false; }
  private calculateSpamScore(content: string): number { return 0.1; }
  private async findSimilarPosts(content: string): Promise<number> { return 2; }
  private async checkProhibitedKeywords(content: string): Promise<string[]> { return []; }
  private async getIPRequestRate(ip: string): Promise<number> { return 30; }
  private async findSimilarRequestPatterns(data: NetworkRequestData): Promise<number> { return 10; }
  private async getAveragePayloadSize(): Promise<number> { return 1024; }
  private async getSystemMetrics(): Promise<any> { return { queueDepth: 1000, avgProcessingLatency: 5000 }; }
  private async getRecentFailureRate(minutes: number): Promise<number> { return 0.05; }
  private async alertSystemAnomalies(anomalies: any[]): Promise<void> {}
  private async getUserSuccessRate(userId: string): Promise<{ successRate: number }> { return { successRate: 0.95 }; }
  private async getSystemLoadScore(): Promise<number> { return 0.4; }
  private async addToWatchlist(schedule: ScheduledPost): Promise<void> {}
  private async notifyHighRiskSchedule(schedule: ScheduledPost): Promise<void> {}
  private async preWarmScheduleResources(schedule: ScheduledPost): Promise<void> {}
  private async increaseRetryLimit(schedule: ScheduledPost): Promise<void> {}
  private async getQueueMetrics(): Promise<any> { return { jobs: [] }; }
  private async handleStuckJobs(jobs: any[]): Promise<void> {}
  private async analyzeProcessingPattern(): Promise<any> { return { isAbnormal: false }; }
  private async adjustProcessingStrategy(pattern: any): Promise<void> {}
  private async tempRateLimitUser(userId: string, minutes: number): Promise<void> {}
  private async blockSchedule(scheduleId: string, reason: string): Promise<void> {}
  private async forceReauthentication(userId: string): Promise<void> {}
  private async tempBlockIP(ip: string, minutes: number): Promise<void> {}
  private async sendSecurityAlert(anomaly: DetectedAnomaly, data: ScheduleMetrics): Promise<void> {}
  private async getTopAnomalyUsers(limit: number): Promise<any[]> { return []; }
  private async getSystemHealth(): Promise<any> { return { status: 'healthy' }; }
  private async getModelAccuracy(): Promise<number> { return 0.95; }
  private async getRecentAlerts(limit: number): Promise<any[]> { return []; }
  private initializeThresholds(): void {
    this.anomalyThresholds.set('ml_threshold', 0.1);
    this.anomalyThresholds.set('rate_threshold', 50);
    this.anomalyThresholds.set('latency_threshold', 30000);
  }
  private async updateAnomalyThresholds(): Promise<void> {
    // Dynamically update thresholds based on historical data
  }
}

interface ScheduleMetrics {
  scheduleId: string;
  userId: string;
  postContent: string;
  schedulesInLastHour: number;
  currentTime: string;
  ipAddress: string;
  userAgent: string;
  typingSpeed?: number;
  deviceFingerprint?: string;
  location?: string;
  interactionSpeed?: number;
}

interface NetworkRequestData {
  ip: string;
  payloadSize: number;
  endpoint: string;
  method: string;
}

interface DetectedAnomaly {
  type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  score: number;
  timestamp: Date;
}

interface AnomalyDetectionResult {
  hasAnomaly: boolean;
  anomalies: DetectedAnomaly[];
  riskScore: number;
  recommendedAction: string;
}

interface AnomalyDashboard {
  totalAnomalies: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  topUsers: any[];
  systemHealth: any;
  mlModelAccuracy: number;
  recentAlerts: any[];
}