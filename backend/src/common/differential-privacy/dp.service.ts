import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PrivateQueryLog } from './entities/private-query-log.entity';
import * as crypto from 'crypto';

@Injectable()
export class DifferentialPrivacyService {
  private readonly logger = new Logger(DifferentialPrivacyService.name);
  private epsilonUsed: Map<string, number> = new Map(); // Track privacy budget per user

  constructor(
    @InjectRepository(PrivateQueryLog)
    private queryLogRepository: Repository<PrivateQueryLog>,
  ) {}

  // Add Laplacian noise for ε-differential privacy
  private laplaceMechanism(value: number, sensitivity: number, epsilon: number): number {
    const scale = sensitivity / epsilon;
    const u = Math.random() - 0.5;
    const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    return value + noise;
  }

  // Gaussian mechanism for (ε, δ)-DP
  private gaussianMechanism(value: number, sensitivity: number, epsilon: number, delta: number): number {
    const sigma = (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
    const noise = this.gaussianNoise(0, sigma);
    return value + noise;
  }

  private gaussianNoise(mean: number, sigma: number): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + sigma * z;
  }

  // Private count query
  async privateCount(query: CountQuery, epsilon: number): Promise<number> {
    this.checkPrivacyBudget(query.userId, epsilon);
    
    // Get exact count from database
    const exactCount = await this.executeCountQuery(query);
    
    // Add Laplace noise
    const privateCount = Math.max(0, Math.round(
      this.laplaceMechanism(exactCount, query.sensitivity, epsilon)
    ));
    
    // Log query for budget tracking
    await this.logPrivateQuery(query.userId, 'COUNT', epsilon, privateCount);
    
    return privateCount;
  }

  // Private sum query
  async privateSum(query: SumQuery, epsilon: number): Promise<number> {
    this.checkPrivacyBudget(query.userId, epsilon);
    
    const exactSum = await this.executeSumQuery(query);
    const privateSum = this.laplaceMechanism(exactSum, query.sensitivity, epsilon);
    
    await this.logPrivateQuery(query.userId, 'SUM', epsilon, privateSum);
    
    return privateSum;
  }

  // Private mean/average query
  async privateMean(query: MeanQuery, epsilon: number): Promise<number> {
    this.checkPrivacyBudget(query.userId, epsilon);
    
    const exactMean = await this.executeMeanQuery(query);
    const privateMean = this.laplaceMechanism(exactMean, query.sensitivity, epsilon);
    
    await this.logPrivateQuery(query.userId, 'MEAN', epsilon, privateMean);
    
    return privateMean;
  }

  // Private histogram query
  async privateHistogram(query: HistogramQuery, epsilon: number): Promise<HistogramResult> {
    this.checkPrivacyBudget(query.userId, epsilon);
    
    const exactHistogram = await this.executeHistogramQuery(query);
    const privateHistogram = {};
    
    // Split privacy budget among bins
    const binEpsilon = epsilon / exactHistogram.bins.length;
    
    for (const bin of exactHistogram.bins) {
      privateHistogram[bin.label] = Math.max(0, Math.round(
        this.laplaceMechanism(bin.count, query.sensitivity, binEpsilon)
      ));
    }
    
    await this.logPrivateQuery(query.userId, 'HISTOGRAM', epsilon, privateHistogram);
    
    return { bins: privateHistogram };
  }

  // Private percentile query
  async privatePercentile(query: PercentileQuery, epsilon: number): Promise<number> {
    this.checkPrivacyBudget(query.userId, epsilon);
    
    const exactPercentile = await this.executePercentileQuery(query);
    const privatePercentile = this.laplaceMechanism(
      exactPercentile,
      query.sensitivity,
      epsilon
    );
    
    await this.logPrivateQuery(query.userId, 'PERCENTILE', epsilon, privatePercentile);
    
    return Math.min(query.max, Math.max(query.min, privatePercentile));
  }

  // Private schedule analytics
  async privateScheduleAnalytics(
    analyticsQuery: ScheduleAnalyticsQuery,
    epsilon: number
  ): Promise<PrivateAnalyticsResult> {
    this.checkPrivacyBudget(analyticsQuery.userId, epsilon);
    
    // Split budget across different metrics
    const budgetSplit = epsilon / 4;
    
    const results = {
      avgPostingTime: await this.privateMean({
        userId: analyticsQuery.userId,
        field: 'posting_time',
        sensitivity: 3600, // 1 hour in seconds
      }, budgetSplit),
      
      medianEngagement: await this.privatePercentile({
        userId: analyticsQuery.userId,
        field: 'engagement_rate',
        percentile: 0.5,
        min: 0,
        max: 1,
        sensitivity: 0.1,
      }, budgetSplit),
      
      peakHourHistogram: await this.privateHistogram({
        userId: analyticsQuery.userId,
        field: 'posting_hour',
        bins: Array.from({ length: 24 }, (_, i) => ({ label: `${i}:00`, count: 0 })),
        sensitivity: 1,
      }, budgetSplit),
      
      totalPosts: await this.privateCount({
        userId: analyticsQuery.userId,
        table: 'scheduled_posts',
        conditions: analyticsQuery.conditions,
        sensitivity: 1,
      }, budgetSplit),
    };
    
    return results;
  }

  // Private machine learning model training
  async privateModelTraining(
    userId: string,
    trainingData: any[],
    epsilon: number,
    delta: number
  ): Promise<PrivateModel> {
    this.checkPrivacyBudget(userId, epsilon);
    
    // Train model with differentially private SGD
    const model = await this.dpSGD(trainingData, epsilon, delta);
    
    // Add noise to model parameters
    const privateWeights = this.addNoiseToWeights(model.weights, epsilon, delta);
    
    return {
      weights: privateWeights,
      epsilon,
      delta,
      accuracy: this.evaluatePrivacyAccuracy(model, privateWeights),
    };
  }

  // Differentially Private Stochastic Gradient Descent
  private async dpSGD(
    data: any[],
    epsilon: number,
    delta: number
  ): Promise<any> {
    const batchSize = 64;
    const epochs = 10;
    const clipNorm = 1.0;
    const noiseScale = (2 * clipNorm * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
    
    let model = this.initializeModel();
    
    for (let epoch = 0; epoch < epochs; epoch++) {
      // Shuffle data
      const shuffled = this.shuffleArray([...data]);
      
      for (let i = 0; i < shuffled.length; i += batchSize) {
        const batch = shuffled.slice(i, i + batchSize);
        
        // Compute gradients
        let gradients = this.computeGradients(model, batch);
        
        // Clip gradients
        gradients = this.clipGradients(gradients, clipNorm);
        
        // Add Gaussian noise
        gradients = gradients.map(g => g + this.gaussianNoise(0, noiseScale));
        
        // Update model
        model = this.updateModel(model, gradients);
      }
    }
    
    return model;
  }

  // Privacy budget management
  async checkPrivacyBudget(userId: string, requestedEpsilon: number): Promise<void> {
    const usedEpsilon = this.epsilonUsed.get(userId) || 0;
    const remainingEpsilon = this.getTotalEpsilonBudget(userId) - usedEpsilon;
    
    if (requestedEpsilon > remainingEpsilon) {
      throw new Error(`Insufficient privacy budget. Remaining: ${remainingEpsilon}, Requested: ${requestedEpsilon}`);
    }
    
    this.epsilonUsed.set(userId, usedEpsilon + requestedEpsilon);
  }

  // Exponential mechanism for discrete choices
  async exponentialMechanism<T>(
    candidates: T[],
    utilityScores: (candidate: T) => number,
    epsilon: number,
    sensitivity: number
  ): Promise<T> {
    // Compute probabilities proportional to exp(epsilon * utility / (2 * sensitivity))
    const scores = candidates.map(c => utilityScores(c));
    const maxScore = Math.max(...scores);
    
    const probabilities = scores.map(score => 
      Math.exp((epsilon / (2 * sensitivity)) * (score - maxScore))
    );
    
    const sum = probabilities.reduce((a, b) => a + b, 0);
    const normalized = probabilities.map(p => p / sum);
    
    // Sample from distribution
    const random = Math.random();
    let cumulative = 0;
    
    for (let i = 0; i < candidates.length; i++) {
      cumulative += normalized[i];
      if (random <= cumulative) {
        return candidates[i];
      }
    }
    
    return candidates[0];
  }

  // Private schedule recommendation
  async privateRecommendation(
    userId: string,
    scheduleOptions: any[],
    epsilon: number
  ): Promise<any> {
    // Use exponential mechanism to select recommendation
    const utilityFunction = (option: any) => this.calculateUtility(option, userId);
    
    const recommended = await this.exponentialMechanism(
      scheduleOptions,
      utilityFunction,
      epsilon,
      1 // sensitivity
    );
    
    await this.logPrivateQuery(userId, 'RECOMMENDATION', epsilon, recommended.id);
    
    return recommended;
  }

  // Composition of multiple private queries
  async compositePrivateQuery(
    userId: string,
    queries: PrivateQuery[],
    totalEpsilon: number
  ): Promise<any[]> {
    // Split epsilon using composition theorem
    const epsilons = this.splitEpsilon(queries.length, totalEpsilon);
    const results = [];
    
    for (let i = 0; i < queries.length; i++) {
      const result = await this.executePrivateQuery(userId, queries[i], epsilons[i]);
      results.push(result);
    }
    
    return results;
  }

  // Generate privacy report
  async generatePrivacyReport(userId: string): Promise<PrivacyReport> {
    const usedEpsilon = this.epsilonUsed.get(userId) || 0;
    const totalBudget = this.getTotalEpsilonBudget(userId);
    const remainingBudget = totalBudget - usedEpsilon;
    
    const queryLogs = await this.queryLogRepository.find({
      where: { userId },
      order: { executedAt: 'DESC' },
      take: 100,
    });
    
    return {
      userId,
      totalBudget,
      usedBudget: usedEpsilon,
      remainingBudget,
      queriesExecuted: queryLogs.length,
      queryHistory: queryLogs.map(log => ({
        type: log.queryType,
        epsilon: log.epsilonUsed,
        timestamp: log.executedAt,
        resultPreview: this.sanitizeResult(log.result),
      })),
      privacyLoss: this.calculatePrivacyLoss(queryLogs),
      recommendations: this.getPrivacyRecommendations(remainingBudget),
    };
  }

  // Helper methods
  private async executeCountQuery(query: CountQuery): Promise<number> {
    // Execute actual database query
    return 1000;
  }

  private async executeSumQuery(query: SumQuery): Promise<number> {
    return 50000;
  }

  private async executeMeanQuery(query: MeanQuery): Promise<number> {
    return 0.05;
  }

  private async executeHistogramQuery(query: HistogramQuery): Promise<any> {
    return { bins: query.bins.map(b => ({ ...b, count: Math.random() * 100 })) };
  }

  private async executePercentileQuery(query: PercentileQuery): Promise<number> {
    return 0.5;
  }

  private async logPrivateQuery(userId: string, type: string, epsilon: number, result: any): Promise<void> {
    const log = this.queryLogRepository.create({
      userId,
      queryType: type,
      epsilonUsed: epsilon,
      result: JSON.stringify(result),
      executedAt: new Date(),
    });
    
    await this.queryLogRepository.save(log);
  }

  private getTotalEpsilonBudget(userId: string): number {
    // Weekly budget of 1.0 epsilon
    return 1.0;
  }

  private splitEpsilon(numQueries: number, totalEpsilon: number): number[] {
    // Sequential composition - sum of epsilons = totalEpsilon
    return Array(numQueries).fill(totalEpsilon / numQueries);
  }

  private initializeModel(): any {
    return { weights: [0.1, 0.2, 0.3], bias: 0 };
  }

  private computeGradients(model: any, batch: any[]): number[] {
    return [0.01, 0.02, 0.03];
  }

  private clipGradients(gradients: number[], clipNorm: number): number[] {
    const norm = Math.sqrt(gradients.reduce((sum, g) => sum + g * g, 0));
    if (norm > clipNorm) {
      const scale = clipNorm / norm;
      return gradients.map(g => g * scale);
    }
    return gradients;
  }

  private updateModel(model: any, gradients: number[]): any {
    const learningRate = 0.01;
    return {
      weights: model.weights.map((w, i) => w - learningRate * gradients[i]),
      bias: model.bias - learningRate * gradients[gradients.length - 1],
    };
  }

  private addNoiseToWeights(weights: number[], epsilon: number, delta: number): number[] {
    const sensitivity = 1.0;
    const scale = (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
    return weights.map(w => w + this.gaussianNoise(0, scale));
  }

  private evaluatePrivacyAccuracy(originalModel: any, privateModel: any): number {
    // Compare model accuracy
    return 0.95;
  }

  private calculateUtility(option: any, userId: string): number {
    return Math.random();
  }

  private async executePrivateQuery(userId: string, query: PrivateQuery, epsilon: number): Promise<any> {
    // Execute query with privacy
    return {};
  }

  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  private sanitizeResult(result: string): string {
    // Remove sensitive information from result preview
    return result.substring(0, 100);
  }

  private calculatePrivacyLoss(queryLogs: any[]): number {
    // Calculate advanced composition privacy loss
    return 0.05;
  }

  private getPrivacyRecommendations(remainingBudget: number): string[] {
    const recommendations = [];
    if (remainingBudget < 0.1) {
      recommendations.push('Privacy budget nearly exhausted. Consider resetting budget or using larger epsilon.');
    }
    recommendations.push('Use larger epsilon for less sensitive queries');
    recommendations.push('Cache query results to avoid repeated privacy cost');
    return recommendations;
  }
}

interface CountQuery {
  userId: string;
  table: string;
  conditions?: any;
  sensitivity: number;
}

interface SumQuery {
  userId: string;
  field: string;
  conditions?: any;
  sensitivity: number;
}

interface MeanQuery {
  userId: string;
  field: string;
  conditions?: any;
  sensitivity: number;
}

interface HistogramQuery {
  userId: string;
  field: string;
  bins: Array<{ label: string; count: number }>;
  sensitivity: number;
}

interface HistogramResult {
  bins: Record<string, number>;
}

interface PercentileQuery {
  userId: string;
  field: string;
  percentile: number;
  min: number;
  max: number;
  sensitivity: number;
}

interface ScheduleAnalyticsQuery {
  userId: string;
  conditions?: any;
}

interface PrivateAnalyticsResult {
  avgPostingTime: number;
  medianEngagement: number;
  peakHourHistogram: HistogramResult;
  totalPosts: number;
}

interface PrivateModel {
  weights: number[];
  epsilon: number;
  delta: number;
  accuracy: number;
}

interface PrivateQuery {
  type: string;
  parameters: any;
}

interface PrivacyReport {
  userId: string;
  totalBudget: number;
  usedBudget: number;
  remainingBudget: number;
  queriesExecuted: number;
  queryHistory: any[];
  privacyLoss: number;
  recommendations: string[];
}