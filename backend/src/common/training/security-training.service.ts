import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SecurityTrainingService {
  private readonly logger = new Logger(SecurityTrainingService.name);
  private trainingModules: TrainingModule[] = [];
  private userProgress: Map<string, UserTrainingProgress> = new Map();

  async assignTraining(userId: string, role: string): Promise<TrainingAssignment> {
    const requiredModules = this.getModulesForRole(role);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30); // 30 days to complete

    const assignment: TrainingAssignment = {
      userId,
      role,
      modules: requiredModules,
      assignedAt: new Date(),
      dueDate,
      status: 'PENDING',
    };

    this.userProgress.set(userId, {
      userId,
      completedModules: [],
      scores: {},
      lastActivity: null,
      certificateIssued: false,
    });

    // Send notification
    await this.sendTrainingNotification(userId, assignment);

    return assignment;
  }

  private getModulesForRole(role: string): TrainingModule[] {
    const baseModules = [
      {
        id: 'SEC-101',
        title: 'Security Awareness Fundamentals',
        description: 'Basic security concepts and best practices',
        duration: 30, // minutes
        required: true,
        passingScore: 80,
      },
      {
        id: 'SEC-102',
        title: 'Password Security and MFA',
        description: 'Creating strong passwords, using password managers, enabling MFA',
        duration: 20,
        required: true,
        passingScore: 85,
      },
      {
        id: 'SEC-103',
        title: 'Phishing Detection',
        description: 'How to identify and report phishing attempts',
        duration: 25,
        required: true,
        passingScore: 90,
      },
      {
        id: 'SEC-104',
        title: 'Data Protection and Privacy (GDPR)',
        description: 'Handling personal data, privacy regulations, data classification',
        duration: 45,
        required: true,
        passingScore: 85,
      },
    ];

    const roleSpecificModules: Record<string, TrainingModule[]> = {
      DEVELOPER: [
        {
          id: 'DEV-201',
          title: 'Secure Coding Practices',
          description: 'OWASP Top 10, input validation, SQL injection prevention',
          duration: 60,
          required: true,
          passingScore: 85,
        },
        {
          id: 'DEV-202',
          title: 'API Security',
          description: 'JWT security, rate limiting, authentication best practices',
          duration: 45,
          required: true,
          passingScore: 85,
        },
        {
          id: 'DEV-203',
          title: 'Dependency Management',
          description: 'Scanning vulnerabilities, updating dependencies',
          duration: 30,
          required: true,
          passingScore: 80,
        },
      ],
      ADMIN: [
        {
          id: 'ADMIN-201',
          title: 'Access Control Management',
          description: 'RBAC, least privilege, access reviews',
          duration: 40,
          required: true,
          passingScore: 90,
        },
        {
          id: 'ADMIN-202',
          title: 'Incident Response',
          description: 'Detecting, reporting, and responding to security incidents',
          duration: 50,
          required: true,
          passingScore: 85,
        },
      ],
      SUPPORT: [
        {
          id: 'SUP-201',
          title: 'Customer Data Handling',
          description: 'Proper handling of customer PII, support ticket security',
          duration: 35,
          required: true,
          passingScore: 85,
        },
      ],
    };

    return [...baseModules, ...(roleSpecificModules[role] || [])];
  }

  async submitQuiz(userId: string, moduleId: string, answers: QuizAnswers): Promise<QuizResult> {
    const module = this.findModule(moduleId);
    const progress = this.userProgress.get(userId);

    if (!module || !progress) {
      throw new Error('Invalid module or user');
    }

    const score = this.gradeQuiz(module, answers);
    const passed = score >= module.passingScore;

    if (!progress.completedModules.includes(moduleId)) {
      progress.completedModules.push(moduleId);
    }
    progress.scores[moduleId] = score;
    progress.lastActivity = new Date();

    const result: QuizResult = {
      moduleId,
      score,
      passed,
      passedAt: passed ? new Date() : undefined,
      incorrectAnswers: this.getIncorrectAnswers(module, answers),
      recommendations: this.getRecommendations(module, score),
    };

    // Check if all required modules completed
    const requiredModules = this.getModulesForRole(progress.userRole || 'EMPLOYEE')
      .filter(m => m.required)
      .map(m => m.id);
    
    const allCompleted = requiredModules.every(id => progress.completedModules.includes(id));
    
    if (allCompleted && !progress.certificateIssued) {
      progress.certificateIssued = true;
      await this.issueCertificate(userId, progress);
    }

    return result;
  }

  private gradeQuiz(module: TrainingModule, answers: QuizAnswers): number {
    let correctCount = 0;
    
    for (const question of module.quizQuestions || []) {
      if (answers[question.id] === question.correctAnswer) {
        correctCount++;
      }
    }
    
    return (correctCount / (module.quizQuestions?.length || 1)) * 100;
  }

  async runPhishingSimulation(): Promise<PhishingSimulationResult> {
    const users = await this.getActiveUsers();
    const results: PhishingSimulationResult = {
      simulationId: `phish_${Date.now()}`,
      startTime: new Date(),
      totalUsers: users.length,
      clickedLinks: 0,
      reportedPhishing: 0,
      userResults: [],
    };

    for (const user of users) {
      const sentEmail = await this.sendPhishingEmail(user);
      const userAction = await this.trackUserAction(sentEmail.id);
      
      results.userResults.push({
        userId: user.id,
        clicked: userAction.clicked,
        reported: userAction.reported,
        timeToReport: userAction.timeToReport,
      });

      if (userAction.clicked) results.clickedLinks++;
      if (userAction.reported) results.reportedPhishing++;
    }

    results.endTime = new Date();
    results.clickRate = (results.clickedLinks / results.totalUsers) * 100;
    results.reportRate = (results.reportedPhishing / results.totalUsers) * 100;

    // Generate report
    await this.generatePhishingReport(results);

    // Assign remedial training for clickers
    for (const userResult of results.userResults) {
      if (userResult.clicked) {
        await this.assignRemedialTraining(userResult.userId);
      }
    }

    return results;
  }

  async generateTrainingReport(): Promise<TrainingReport> {
    const report: TrainingReport = {
      generatedAt: new Date(),
      totalEmployees: this.userProgress.size,
      complianceRate: 0,
      averageScore: 0,
      overdueTrainings: [],
      topPerforming: [],
      needsRemediation: [],
    };

    let totalScore = 0;
    let completedCount = 0;

    for (const [userId, progress] of this.userProgress) {
      const moduleScores = Object.values(progress.scores);
      const avgScore = moduleScores.reduce((a, b) => a + b, 0) / (moduleScores.length || 1);
      totalScore += avgScore;
      
      if (moduleScores.length > 0) completedCount++;
      
      // Check for overdue training
      const assignment = await this.getAssignment(userId);
      if (assignment && assignment.dueDate < new Date() && moduleScores.length < assignment.modules.length) {
        report.overdueTrainings.push({ userId, dueDate: assignment.dueDate });
      }
      
      // Top performers (>90% on all modules)
      if (moduleScores.every(score => score >= 90)) {
        report.topPerforming.push(userId);
      }
      
      // Needs remediation (<70% on any module)
      if (moduleScores.some(score => score < 70)) {
        report.needsRemediation.push(userId);
      }
    }

    report.complianceRate = (completedCount / (this.userProgress.size || 1)) * 100;
    report.averageScore = totalScore / (this.userProgress.size || 1);

    return report;
  }

  private async generateCertificate(userId: string, progress: UserTrainingProgress): Promise<Buffer> {
    // Generate PDF certificate
    const pdf = `
      <html>
        <head><title>Security Training Certificate</title></head>
        <body>
          <h1>Certificate of Completion</h1>
          <p>This certifies that User ${userId}</p>
          <p>has completed all required security training modules</p>
          <p>Date: ${new Date().toISOString()}</p>
        </body>
      </html>
    `;
    
    return Buffer.from(pdf);
  }

  private async sendTrainingNotification(userId: string, assignment: TrainingAssignment): Promise<void> {}
  private async sendPhishingEmail(user: any): Promise<any> { return { id: 'email_' + Date.now() }; }
  private async trackUserAction(emailId: string): Promise<any> { return { clicked: false, reported: true, timeToReport: 120 }; }
  private async getActiveUsers(): Promise<any[]> { return []; }
  private async generatePhishingReport(results: PhishingSimulationResult): Promise<void> {}
  private async assignRemedialTraining(userId: string): Promise<void> {}
  private async getAssignment(userId: string): Promise<TrainingAssignment | null> { return null; }
  private async issueCertificate(userId: string, progress: UserTrainingProgress): Promise<void> {}
  private findModule(moduleId: string): TrainingModule | undefined {
    return this.trainingModules.find(m => m.id === moduleId);
  }
  private getIncorrectAnswers(module: TrainingModule, answers: QuizAnswers): any[] { return []; }
  private getRecommendations(module: TrainingModule, score: number): string[] { return []; }
}

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  duration: number;
  required: boolean;
  passingScore: number;
  quizQuestions?: QuizQuestion[];
}

interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

interface QuizAnswers {
  [questionId: string]: string;
}

interface QuizResult {
  moduleId: string;
  score: number;
  passed: boolean;
  passedAt?: Date;
  incorrectAnswers: any[];
  recommendations: string[];
}

interface TrainingAssignment {
  userId: string;
  role: string;
  modules: TrainingModule[];
  assignedAt: Date;
  dueDate: Date;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
}

interface UserTrainingProgress {
  userId: string;
  userRole?: string;
  completedModules: string[];
  scores: Record<string, number>;
  lastActivity: Date | null;
  certificateIssued: boolean;
}

interface PhishingSimulationResult {
  simulationId: string;
  startTime: Date;
  endTime?: Date;
  totalUsers: number;
  clickedLinks: number;
  reportedPhishing: number;
  clickRate: number;
  reportRate: number;
  userResults: Array<{
    userId: string;
    clicked: boolean;
    reported: boolean;
    timeToReport?: number;
  }>;
}

interface TrainingReport {
  generatedAt: Date;
  totalEmployees: number;
  complianceRate: number;
  averageScore: number;
  overdueTrainings: Array<{ userId: string; dueDate: Date }>;
  topPerforming: string[];
  needsRemediation: string[];
}