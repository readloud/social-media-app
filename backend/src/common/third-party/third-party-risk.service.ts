import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ThirdPartyRiskManagementService {
  private readonly logger = new Logger(ThirdPartyRiskManagementService.name);
  private vendors: Vendor[] = [];

  async onboardVendor(vendorData: VendorOnboardingRequest): Promise<Vendor> {
    this.logger.log(`Onboarding vendor: ${vendorData.name}`);

    // 1. Security assessment
    const securityScore = await this.assessVendorSecurity(vendorData);
    
    // 2. Compliance check
    const complianceStatus = await this.checkVendorCompliance(vendorData);
    
    // 3. Data handling review
    const dataHandlingReview = await this.reviewDataHandling(vendorData);
    
    // 4. Business continuity check
    const bcStatus = await this.checkBusinessContinuity(vendorData);
    
    // 5. Legal review
    const legalReview = await this.reviewLegalAgreements(vendorData);

    const vendor: Vendor = {
      id: `vendor_${Date.now()}`,
      name: vendorData.name,
      serviceType: vendorData.serviceType,
      dataAccessLevel: vendorData.dataAccessLevel,
      securityScore,
      complianceStatus,
      riskLevel: this.calculateRiskLevel(securityScore, complianceStatus),
      status: 'ONBOARDING',
      onboardedAt: new Date(),
      contracts: vendorData.contracts,
      securityQuestionnaire: vendorData.securityQuestionnaire,
      lastAssessmentDate: new Date(),
      nextAssessmentDate: this.calculateNextAssessmentDate(securityScore),
    };

    this.vendors.push(vendor);
    await this.notifyVendorOnboarded(vendor);
    
    return vendor;
  }

  private async assessVendorSecurity(vendor: VendorOnboardingRequest): Promise<SecurityAssessment> {
    const assessment: SecurityAssessment = {
      score: 0,
      findings: [],
      passed: false,
    };

    // SOC2 Type 2 certification
    if (vendor.certifications?.includes('SOC2')) {
      assessment.score += 20;
    } else {
      assessment.findings.push('Missing SOC2 certification');
    }

    // ISO 27001 certification
    if (vendor.certifications?.includes('ISO27001')) {
      assessment.score += 20;
    } else {
      assessment.findings.push('Missing ISO 27001 certification');
    }

    // Data encryption at rest and in transit
    if (vendor.securityControls?.encryptionAtRest && vendor.securityControls?.encryptionInTransit) {
      assessment.score += 15;
    } else {
      assessment.findings.push('Inadequate encryption controls');
    }

    // Incident response plan
    if (vendor.securityControls?.incidentResponsePlan) {
      assessment.score += 10;
    } else {
      assessment.findings.push('No incident response plan provided');
    }

    // Regular penetration testing
    if (vendor.securityControls?.penTestFrequency && vendor.securityControls.penTestFrequency <= 12) {
      assessment.score += 10;
    } else {
      assessment.findings.push('No regular penetration testing');
    }

    // Access controls
    if (vendor.securityControls?.mfaEnabled && vendor.securityControls?.leastPrivilege) {
      assessment.score += 15;
    } else {
      assessment.findings.push('Weak access controls');
    }

    // Background checks for employees
    if (vendor.securityControls?.backgroundChecks) {
      assessment.score += 10;
    } else {
      assessment.findings.push('No employee background checks');
    }

    assessment.passed = assessment.score >= 70;
    assessment.score = Math.min(100, assessment.score);

    return assessment;
  }

  private async checkVendorCompliance(vendor: VendorOnboardingRequest): Promise<ComplianceStatus> {
    const compliance: ComplianceStatus = {
      gdpr: false,
      soc2: false,
      hipaa: false,
      pci: false,
      iso27001: false,
      details: [],
    };

    // Check GDPR compliance
    if (vendor.compliance?.gdpr) {
      compliance.gdpr = true;
      compliance.details.push('GDPR compliant - Data Processing Agreement in place');
    } else if (vendor.processesEUData) {
      compliance.details.push('⚠️ Processes EU data but no GDPR compliance documented');
    }

    // Check SOC2
    if (vendor.compliance?.soc2) {
      compliance.soc2 = true;
      compliance.details.push('SOC2 Type 2 certified');
    }

    // Check HIPAA (if handling health data)
    if (vendor.handlesHealthData && vendor.compliance?.hipaa) {
      compliance.hipaa = true;
      compliance.details.push('HIPAA compliant - Business Associate Agreement signed');
    }

    return compliance;
  }

  private async reviewDataHandling(vendor: VendorOnboardingRequest): Promise<DataHandlingReview> {
    const review: DataHandlingReview = {
      approved: false,
      concerns: [],
      dataRetentionPolicy: null,
      dataDeletionProcess: null,
      subprocessors: [],
    };

    // Review data retention
    if (vendor.dataRetentionDays && vendor.dataRetentionDays <= 90) {
      review.dataRetentionPolicy = `Retains data for ${vendor.dataRetentionDays} days`;
    } else if (vendor.dataRetentionDays > 90) {
      review.concerns.push(`Data retention period (${vendor.dataRetentionDays} days) exceeds policy limit`);
    } else {
      review.concerns.push('No data retention policy documented');
    }

    // Review data deletion process
    if (vendor.dataDeletionProcess) {
      review.dataDeletionProcess = vendor.dataDeletionProcess;
      if (vendor.dataDeletionProcess.includes('automated') && vendor.deletionTimeframeDays <= 30) {
        review.approved = true;
      } else {
        review.concerns.push('Manual or slow data deletion process');
      }
    }

    // Review subprocessors
    if (vendor.subprocessors && vendor.subprocessors.length > 0) {
      review.subprocessors = vendor.subprocessors;
      review.concerns.push(`Uses ${vendor.subprocessors.length} subprocessors - additional risk introduced`);
    }

    return review;
  }

  private async checkBusinessContinuity(vendor: VendorOnboardingRequest): Promise<BusinessContinuityStatus> {
    const status: BusinessContinuityStatus = {
      hasBCP: false,
      rto: null,
      rpo: null,
      backupFrequency: null,
      alternateLocation: false,
    };

    if (vendor.businessContinuity?.hasBCP) {
      status.hasBCP = true;
      status.rto = vendor.businessContinuity.rto;
      status.rpo = vendor.businessContinuity.rpo;
      
      if (status.rto && status.rto <= 4) {
        // Good RTO (4 hours or less)
      } else if (status.rto && status.rto > 24) {
        this.logger.warn(`Vendor ${vendor.name} has high RTO: ${status.rto} hours`);
      }
    }

    if (vendor.businessContinuity?.backupFrequency) {
      status.backupFrequency = vendor.businessContinuity.backupFrequency;
    }

    if (vendor.businessContinuity?.alternateLocation) {
      status.alternateLocation = true;
    }

    return status;
  }

  private async reviewLegalAgreements(vendor: VendorOnboardingRequest): Promise<LegalReview> {
    const review: LegalReview = {
      dpaSigned: false,
      slaSigned: false,
      indemnificationClause: false,
      liabilityLimit: null,
      terminationClause: false,
    };

    // Data Processing Agreement
    if (vendor.legalDocuments?.dpa) {
      review.dpaSigned = true;
    } else {
      this.logger.warn(`DPA missing for vendor ${vendor.name}`);
    }

    // Service Level Agreement
    if (vendor.legalDocuments?.sla) {
      review.slaSigned = true;
      review.liabilityLimit = vendor.legalDocuments.liabilityLimit;
    }

    // Indemnification
    if (vendor.legalDocuments?.indemnification) {
      review.indemnificationClause = true;
    }

    // Termination clause
    if (vendor.legalDocuments?.terminationClause) {
      review.terminationClause = true;
    }

    return review;
  }

  async performVendorAudit(vendorId: string): Promise<VendorAuditReport> {
    const vendor = this.vendors.find(v => v.id === vendorId);
    
    if (!vendor) {
      throw new Error('Vendor not found');
    }

    this.logger.log(`Performing audit for vendor: ${vendor.name}`);

    const auditReport: VendorAuditReport = {
      vendorId,
      vendorName: vendor.name,
      auditDate: new Date(),
      findings: [],
      riskLevel: vendor.riskLevel,
      recommendations: [],
      overallScore: vendor.securityScore.score,
    };

    // Re-assess security
    const newSecurityScore = await this.assessVendorSecurity({
      name: vendor.name,
      serviceType: vendor.serviceType,
      dataAccessLevel: vendor.dataAccessLevel,
      certifications: vendor.securityQuestionnaire?.certifications,
      securityControls: vendor.securityQuestionnaire?.securityControls,
      // ... other fields
    } as VendorOnboardingRequest);

    if (newSecurityScore.score < vendor.securityScore.score - 10) {
      auditReport.findings.push({
        severity: 'HIGH',
        description: `Security score dropped from ${vendor.securityScore.score} to ${newSecurityScore.score}`,
        remediation: 'Request updated security documentation and remediation plan',
      });
    }

    // Check for reported incidents
    const incidents = await this.checkVendorIncidents(vendor);
    if (incidents.length > 0) {
      auditReport.findings.push({
        severity: 'CRITICAL',
        description: `Vendor reported ${incidents.length} security incidents since last audit`,
        remediation: 'Review incident details and impact assessment',
      });
    }

    // Update vendor record
    vendor.lastAssessmentDate = auditReport.auditDate;
    vendor.securityScore = newSecurityScore;
    vendor.riskLevel = this.calculateRiskLevel(newSecurityScore, vendor.complianceStatus);
    vendor.nextAssessmentDate = this.calculateNextAssessmentDate(newSecurityScore);

    return auditReport;
  }

  async offboardVendor(vendorId: string): Promise<void> {
    const vendor = this.vendors.find(v => v.id === vendorId);
    
    if (!vendor) {
      throw new Error('Vendor not found');
    }

    this.logger.warn(`Offboarding vendor: ${vendor.name}`);

    // 1. Ensure data deletion
    await this.requestDataDeletion(vendor);
    
    // 2. Revoke access
    await this.revokeVendorAccess(vendor);
    
    // 3. Update contracts
    await this.terminateContracts(vendor);
    
    // 4. Final audit
    const finalAudit = await this.performOffboardingAudit(vendor);
    
    // 5. Archive records
    vendor.status = 'OFFBOARDED';
    vendor.offboardedAt = new Date();
    vendor.offboardingAudit = finalAudit;

    this.logger.log(`Vendor ${vendor.name} offboarded successfully`);
  }

  getVendorRiskReport(): VendorRiskReport {
    const activeVendors = this.vendors.filter(v => v.status === 'ACTIVE');
    
    return {
      totalVendors: activeVendors.length,
      highRiskVendors: activeVendors.filter(v => v.riskLevel === 'HIGH').length,
      mediumRiskVendors: activeVendors.filter(v => v.riskLevel === 'MEDIUM').length,
      lowRiskVendors: activeVendors.filter(v => v.riskLevel === 'LOW').length,
      vendors: activeVendors.map(v => ({
        name: v.name,
        riskLevel: v.riskLevel,
        securityScore: v.securityScore.score,
        lastAssessment: v.lastAssessmentDate,
        nextAssessment: v.nextAssessmentDate,
      })),
      recommendations: this.generateVendorRecommendations(activeVendors),
    };
  }

  private calculateRiskLevel(securityScore: SecurityAssessment, compliance: ComplianceStatus): RiskLevel {
    if (securityScore.score < 60) return 'HIGH';
    if (securityScore.score < 80) return 'MEDIUM';
    if (!compliance.gdpr && compliance.details.some(d => d.includes('EU data'))) return 'HIGH';
    return 'LOW';
  }

  private calculateNextAssessmentDate(securityScore: SecurityAssessment): Date {
    const date = new Date();
    const monthsToAdd = securityScore.score >= 90 ? 12 : securityScore.score >= 70 ? 6 : 3;
    date.setMonth(date.getMonth() + monthsToAdd);
    return date;
  }

  private generateVendorRecommendations(vendors: Vendor[]): string[] {
    const recommendations = [];
    
    const highRiskVendors = vendors.filter(v => v.riskLevel === 'HIGH');
    if (highRiskVendors.length > 0) {
      recommendations.push(`Immediately review ${highRiskVendors.length} high-risk vendors`);
      recommendations.push('Consider replacing or implementing additional controls for high-risk vendors');
    }

    const vendorsNeedingAssessment = vendors.filter(v => v.nextAssessmentDate < new Date());
    if (vendorsNeedingAssessment.length > 0) {
      recommendations.push(`Perform security assessments for ${vendorsNeedingAssessment.length} vendors past due date`);
    }

    recommendations.push('Maintain updated vendor inventory and risk assessments');
    recommendations.push('Regularly review vendor access and data handling practices');
    recommendations.push('Ensure all vendors have signed DPAs and SLAs');

    return recommendations;
  }

  // Mock methods
  private async notifyVendorOnboarded(vendor: Vendor): Promise<void> {}
  private async checkVendorIncidents(vendor: Vendor): Promise<any[]> { return []; }
  private async requestDataDeletion(vendor: Vendor): Promise<void> {}
  private async revokeVendorAccess(vendor: Vendor): Promise<void> {}
  private async terminateContracts(vendor: Vendor): Promise<void> {}
  private async performOffboardingAudit(vendor: Vendor): Promise<any> { return {}; }
}

interface Vendor {
  id: string;
  name: string;
  serviceType: string;
  dataAccessLevel: 'NONE' | 'LIMITED' | 'FULL' | 'CRITICAL';
  securityScore: SecurityAssessment;
  complianceStatus: ComplianceStatus;
  riskLevel: RiskLevel;
  status: 'ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED';
  onboardedAt: Date;
  offboardedAt?: Date;
  contracts?: any[];
  securityQuestionnaire?: any;
  lastAssessmentDate: Date;
  nextAssessmentDate: Date;
  offboardingAudit?: any;
}

interface VendorOnboardingRequest {
  name: string;
  serviceType: string;
  dataAccessLevel: 'NONE' | 'LIMITED' | 'FULL' | 'CRITICAL';
  certifications?: string[];
  securityControls?: any;
  compliance?: any;
  processesEUData?: boolean;
  handlesHealthData?: boolean;
  dataRetentionDays?: number;
  dataDeletionProcess?: string;
  deletionTimeframeDays?: number;
  subprocessors?: string[];
  businessContinuity?: any;
  legalDocuments?: any;
  contracts?: any;
  securityQuestionnaire?: any;
}

interface SecurityAssessment {
  score: number;
  findings: string[];
  passed: boolean;
}

interface ComplianceStatus {
  gdpr: boolean;
  soc2: boolean;
  hipaa: boolean;
  pci: boolean;
  iso27001: boolean;
  details: string[];
}

interface DataHandlingReview {
  approved: boolean;
  concerns: string[];
  dataRetentionPolicy: string | null;
  dataDeletionProcess: string | null;
  subprocessors: string[];
}

interface BusinessContinuityStatus {
  hasBCP: boolean;
  rto: number | null;
  rpo: number | null;
  backupFrequency: string | null;
  alternateLocation: boolean;
}

interface LegalReview {
  dpaSigned: boolean;
  slaSigned: boolean;
  indemnificationClause: boolean;
  liabilityLimit: string | null;
  terminationClause: boolean;
}

interface VendorAuditReport {
  vendorId: string;
  vendorName: string;
  auditDate: Date;
  findings: Array<{ severity: string; description: string; remediation: string }>;
  riskLevel: RiskLevel;
  recommendations: string[];
  overallScore: number;
}

interface VendorRiskReport {
  totalVendors: number;
  highRiskVendors: number;
  mediumRiskVendors: number;
  lowRiskVendors: number;
  vendors: Array<{
    name: string;
    riskLevel: RiskLevel;
    securityScore: number;
    lastAssessment: Date;
    nextAssessment: Date;
  }>;
  recommendations: string[];
}

type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';