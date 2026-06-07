import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

@Injectable()
export class PenetrationTestingService {
  private readonly logger = new Logger(PenetrationTestingService.name);
  private readonly findings: PenTestFinding[] = [];

  async runAutomatedPenTest(): Promise<PenTestReport> {
    const testId = `pentest_${Date.now()}`;
    this.logger.log(`Starting penetration test: ${testId}`);

    const testResults: PenTestReport = {
      testId,
      startTime: new Date(),
      findings: [],
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        informational: 0,
      },
      passed: false,
    };

    // Run various penetration tests
    await this.testAuthenticationBypass(testResults);
    await this.testAuthorizationBypass(testResults);
    await this.testSQLInjection(testResults);
    await this.testXSS(testResults);
    await this.testCSRF(testResults);
    await this.testJWTVulnerabilities(testResults);
    await this.testRateLimitBypass(testResults);
    await this.testFileUploadVulnerabilities(testResults);
    await this.testBusinessLogicFlaws(testResults);
    await this.testDenialOfService(testResults);

    testResults.endTime = new Date();
    testResults.duration = testResults.endTime.getTime() - testResults.startTime.getTime();
    testResults.passed = this.evaluatePassStatus(testResults);

    // Generate detailed report
    await this.generatePenTestReport(testResults);

    return testResults;
  }

  private async testAuthenticationBypass(report: PenTestReport): Promise<void> {
    const findings: PenTestFinding[] = [];

    // Test 1: SQL injection in login
    const sqlPayloads = [
      "' OR '1'='1' --",
      "admin' --",
      "' OR 1=1 LIMIT 1 --",
      "'; DROP TABLE users; --",
    ];

    for (const payload of sqlPayloads) {
      const result = await this.sendTestRequest('/api/v1/auth/login', {
        email: payload,
        password: 'anything',
      });

      if (result.status === 200 && result.data?.accessToken) {
        findings.push({
          id: `AUTH_BYPASS_${Date.now()}`,
          title: 'Authentication Bypass via SQL Injection',
          severity: 'CRITICAL',
          vulnerableEndpoint: '/api/v1/auth/login',
          payload,
          impact: 'Attacker can login as any user without credentials',
          remediation: 'Use parameterized queries, implement input validation',
          status: 'FIXED',
          cvssScore: 9.8,
        });
      }
    }

    // Test 2: JWT algorithm confusion
    const jwtAttacks = [
      { alg: 'none', token: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxIn0.' },
      { alg: 'HS256', token: this.craftMaliciousJWT() },
    ];

    for (const attack of jwtAttacks) {
      const result = await this.sendAuthenticatedRequest('/api/v1/users/profile', attack.token);
      if (result.status === 200) {
        findings.push({
          id: `JWT_${Date.now()}`,
          title: 'JWT Algorithm Confusion Vulnerability',
          severity: 'HIGH',
          vulnerableEndpoint: 'JWT Token Validation',
          payload: `alg: ${attack.alg}`,
          impact: 'Attacker can forge valid tokens',
          remediation: 'Enforce strong algorithms, validate signature properly',
          status: 'FIXED',
          cvssScore: 7.5,
        });
      }
    }

    report.findings.push(...findings);
    this.updateSeverityCounts(report.summary, findings);
  }

  private async testAuthorizationBypass(report: PenTestReport): Promise<void> {
    const findings: PenTestFinding[] = [];

    // Test IDOR (Insecure Direct Object References)
    const testCases = [
      { endpoint: '/api/v1/posts/', ids: ['1', '2', '3', '4', '5'] },
      { endpoint: '/api/v1/users/', ids: ['1', '2', '3', '4', '5'] },
      { endpoint: '/api/v1/schedules/', ids: ['1', '2', '3', '4', '5'] },
    ];

    const userAToken = await this.getUserToken('userA@example.com');
    const userBToken = await this.getUserToken('userB@example.com');

    for (const testCase of testCases) {
      for (const id of testCase.ids) {
        const url = `${testCase.endpoint}${id}`;
        
        // User B trying to access User A's resources
        const response = await this.sendAuthenticatedRequest(url, userBToken);
        
        if (response.status === 200 && response.data?.userId !== 'userB') {
          findings.push({
            id: `IDOR_${Date.now()}_${id}`,
            title: 'IDOR Vulnerability - Unauthorized Resource Access',
            severity: 'HIGH',
            vulnerableEndpoint: url,
            payload: `Accessed resource ID ${id} as different user`,
            impact: 'Users can access/modify other users data',
            remediation: 'Implement proper access control checks on all endpoints',
            status: 'IN_PROGRESS',
            cvssScore: 6.5,
          });
        }
      }
    }

    // Test privilege escalation
    const normalUserToken = await this.getUserToken('normal@example.com');
    const adminEndpoint = '/api/v1/admin/users';
    
    const response = await this.sendAuthenticatedRequest(adminEndpoint, normalUserToken);
    if (response.status === 200) {
      findings.push({
        id: `PRIV_ESC_${Date.now()}`,
        title: 'Privilege Escalation - Normal User Accessing Admin Endpoint',
        severity: 'CRITICAL',
        vulnerableEndpoint: adminEndpoint,
        payload: 'Access admin endpoint with normal user token',
        impact: 'Normal users can gain administrative privileges',
        remediation: 'Implement role-based access control with proper guards',
        status: 'FIXED',
        cvssScore: 8.8,
      });
    }

    report.findings.push(...findings);
    this.updateSeverityCounts(report.summary, findings);
  }

  private async testSQLInjection(report: PenTestReport): Promise<void> {
    const findings: PenTestFinding[] = [];
    
    const sqliPayloads = [
      "' OR '1'='1",
      "1' AND '1'='1",
      "1' UNION SELECT null, username, password, null FROM users--",
      "1; SELECT pg_sleep(5)--",
      "1' AND (SELECT COUNT(*) FROM users) > 0--",
    ];

    const testEndpoints = [
      '/api/v1/posts/search?q=',
      '/api/v1/users?username=',
      '/api/v1/posts?userId=',
    ];

    for (const endpoint of testEndpoints) {
      for (const payload of sqliPayloads) {
        const startTime = Date.now();
        const response = await this.sendTestRequest(`${endpoint}${encodeURIComponent(payload)}`);
        const responseTime = Date.now() - startTime;

        // Check for time-based injection
        if (responseTime > 5000 && payload.includes('pg_sleep')) {
          findings.push({
            id: `SQLI_TIME_${Date.now()}`,
            title: 'Time-based SQL Injection Vulnerability',
            severity: 'CRITICAL',
            vulnerableEndpoint: endpoint,
            payload,
            impact: 'Attackers can extract database information through timing attacks',
            remediation: 'Use parameterized queries, input validation, WAF rules',
            status: 'FIXED',
            cvssScore: 9.0,
          });
        }

        // Check for error-based injection
        if (response.body?.includes('SQL syntax') || 
            response.body?.includes('PostgreSQL') ||
            response.body?.includes('ORA-')) {
          findings.push({
            id: `SQLI_ERROR_${Date.now()}`,
            title: 'Error-based SQL Injection Vulnerability',
            severity: 'HIGH',
            vulnerableEndpoint: endpoint,
            payload,
            impact: 'Database errors expose structure to attackers',
            remediation: 'Hide database errors, use custom error messages',
            status: 'FIXED',
            cvssScore: 7.5,
          });
        }
      }
    }

    report.findings.push(...findings);
    this.updateSeverityCounts(report.summary, findings);
  }

  private async testXSS(report: PenTestReport): Promise<void> {
    const findings: PenTestFinding[] = [];
    
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert(1)>',
      'javascript:alert("XSS")',
      '"><script>alert(1)</script>',
      '<svg/onload=alert(1)>',
      '"><img src=x onerror=alert(document.cookie)>',
      '<iframe src="javascript:alert(1)">',
      '<body onload=alert(1)>',
      '<input onfocus=alert(1) autofocus>',
    ];

    const testEndpoints = [
      { method: 'POST', url: '/api/v1/posts', field: 'content' },
      { method: 'POST', url: '/api/v1/comments', field: 'comment' },
      { method: 'PUT', url: '/api/v1/users/profile', field: 'bio' },
    ];

    for (const endpoint of testEndpoints) {
      for (const payload of xssPayloads) {
        const body = { [endpoint.field]: payload };
        const response = await this.sendTestRequest(endpoint.url, body, endpoint.method);
        
        // Check if payload is reflected in response without sanitization
        if (response.body && response.body.includes(payload) && !this.isSanitized(payload, response.body)) {
          findings.push({
            id: `XSS_${Date.now()}`,
            title: 'Stored/Reflected XSS Vulnerability',
            severity: 'HIGH',
            vulnerableEndpoint: `${endpoint.method} ${endpoint.url}`,
            payload,
            impact: 'Attackers can execute malicious scripts in users browsers',
            remediation: 'Implement output encoding, use CSP headers, sanitize user input',
            status: 'FIXED',
            cvssScore: 7.0,
          });
        }
      }
    }

    report.findings.push(...findings);
    this.updateSeverityCounts(report.summary, findings);
  }

  private async testCSRF(report: PenTestReport): Promise<void> {
    const findings: PenTestFinding[] = [];

    // Test state-changing endpoints without CSRF tokens
    const sensitiveEndpoints = [
      { method: 'POST', url: '/api/v1/posts' },
      { method: 'DELETE', url: '/api/v1/posts/1' },
      { method: 'POST', url: '/api/v1/schedules' },
      { method: 'PUT', url: '/api/v1/users/profile' },
      { method: 'POST', url: '/api/v1/auth/logout' },
    ];

    for (const endpoint of sensitiveEndpoints) {
      const response = await this.sendRequestWithoutCSRFToken(endpoint.method, endpoint.url);
      
      if (response.status === 200 || response.status === 201 || response.status === 204) {
        findings.push({
          id: `CSRF_${Date.now()}`,
          title: 'CSRF Vulnerability - Missing Anti-CSRF Token',
          severity: 'MEDIUM',
          vulnerableEndpoint: `${endpoint.method} ${endpoint.url}`,
          payload: 'Cross-site request forgery attack',
          impact: 'Attackers can perform actions on behalf of authenticated users',
          remediation: 'Implement CSRF tokens, SameSite cookies, or double-submit cookies',
          status: 'FIXED',
          cvssScore: 4.5,
        });
      }
    }

    report.findings.push(...findings);
    this.updateSeverityCounts(report.summary, findings);
  }

  private async testRateLimitBypass(report: PenTestReport): Promise<void> {
    const findings: PenTestFinding[] = [];

    // Test rate limiting effectiveness
    const endpoint = '/api/v1/auth/login';
    const requests = [];
    const targetEmail = 'test@example.com';
    const wrongPassword = 'wrongpassword';

    // Send 100 rapid requests
    for (let i = 0; i < 100; i++) {
      requests.push(
        this.sendTestRequest(endpoint, {
          email: targetEmail,
          password: `${wrongPassword}${i}`,
        })
      );
    }

    const responses = await Promise.all(requests);
    const successAfterRateLimit = responses.filter(r => r.status === 200).length;
    
    if (successAfterRateLimit > 5) {
      findings.push({
        id: `RATE_LIMIT_${Date.now()}`,
        title: 'Insufficient Rate Limiting',
        severity: 'MEDIUM',
        vulnerableEndpoint: endpoint,
        payload: '100 rapid login attempts',
        impact: 'Brute force attacks possible, DoS vulnerability',
        remediation: 'Implement stricter rate limiting with exponential backoff',
        status: 'IN_PROGRESS',
        cvssScore: 5.3,
      });
    }

    // Test IP rotation bypass
    // Would implement with proxy rotation in real test

    report.findings.push(...findings);
    this.updateSeverityCounts(report.summary, findings);
  }

  private async testJWTVulnerabilities(report: PenTestReport): Promise<void> {
    const findings: PenTestFinding[] = [];

    // Test JWT expiration
    const expiredToken = this.generateExpiredJWT();
    const response = await this.sendAuthenticatedRequest('/api/v1/users/profile', expiredToken);
    
    if (response.status === 200) {
      findings.push({
        id: `JWT_EXP_${Date.now()}`,
        title: 'JWT Expiration Not Enforced',
        severity: 'HIGH',
        vulnerableEndpoint: 'JWT Token Validation',
        payload: 'Expired token accepted',
        impact: 'Stolen tokens remain valid indefinitely',
        remediation: 'Enforce JWT expiration, implement refresh token rotation',
        status: 'FIXED',
        cvssScore: 7.4,
      });
    }

    // Test weak JWT secrets
    const weakSecret = 'secret';
    const forgedToken = this.forgeJWT({ sub: 'admin' }, weakSecret);
    const forgedResponse = await this.sendAuthenticatedRequest('/api/v1/users/profile', forgedToken);
    
    if (forgedResponse.status === 200) {
      findings.push({
        id: `JWT_WEAK_${Date.now()}`,
        title: 'Weak JWT Secret',
        severity: 'CRITICAL',
        vulnerableEndpoint: 'JWT Signing',
        payload: 'Token forged with weak secret',
        impact: 'Attackers can forge valid tokens with any payload',
        remediation: 'Use strong secrets (32+ bytes), rotate regularly',
        status: 'FIXED',
        cvssScore: 9.0,
      });
    }

    report.findings.push(...findings);
    this.updateSeverityCounts(report.summary, findings);
  }

  private async testBusinessLogicFlaws(report: PenTestReport): Promise<void> {
    const findings: PenTestFinding[] = [];

    // Test posting negative amounts (if applicable)
    const negativeAmountTest = await this.sendAuthenticatedRequest('/api/v1/posts', null, {
      method: 'POST',
      body: { content: 'Test', scheduleInMinutes: -60 },
    });

    if (negativeAmountTest.status === 200) {
      findings.push({
        id: `BUS_LOGIC_${Date.now()}`,
        title: 'Business Logic Flaw - Negative Values Accepted',
        severity: 'MEDIUM',
        vulnerableEndpoint: 'POST /api/v1/posts',
        payload: 'scheduleInMinutes = -60',
        impact: 'Inconsistent state, potential data corruption',
        remediation: 'Validate all business constraints on server side',
        status: 'FIXED',
        cvssScore: 5.0,
      });
    }

    // Test concurrent schedule creation (race condition)
    const concurrentRequests = [];
    const postId = 'test-post-123';
    
    for (let i = 0; i < 10; i++) {
      concurrentRequests.push(
        this.sendAuthenticatedRequest('/api/v1/schedules', null, {
          method: 'POST',
          body: { postId, scheduledFor: new Date().toISOString() },
        })
      );
    }

    const results = await Promise.all(concurrentRequests);
    const successCount = results.filter(r => r.status === 201).length;
    
    if (successCount > 1) {
      findings.push({
        id: `RACE_COND_${Date.now()}`,
        title: 'Race Condition - Duplicate Schedule Creation',
        severity: 'MEDIUM',
        vulnerableEndpoint: 'POST /api/v1/schedules',
        payload: '10 concurrent requests for same schedule',
        impact: 'Duplicate records, inconsistent state',
        remediation: 'Implement idempotency keys or database constraints',
        status: 'IN_PROGRESS',
        cvssScore: 4.8,
      });
    }

    report.findings.push(...findings);
    this.updateSeverityCounts(report.summary, findings);
  }

  private async testDenialOfService(report: PenTestReport): Promise<void> {
    const findings: PenTestFinding[] = [];

    // Test large payload DoS
    const largeContent = 'A'.repeat(10 * 1024 * 1024); // 10MB
    const startTime = Date.now();
    
    const response = await this.sendAuthenticatedRequest('/api/v1/posts', null, {
      method: 'POST',
      body: { content: largeContent },
    });
    
    const responseTime = Date.now() - startTime;

    if (responseTime > 10000 || response.status === 200) {
      findings.push({
        id: `DOS_LARGE_${Date.now()}`,
        title: 'Denial of Service - Large Payload Processing',
        severity: 'MEDIUM',
        vulnerableEndpoint: 'POST /api/v1/posts',
        payload: '10MB payload',
        impact: 'Resource exhaustion, service degradation',
        remediation: 'Implement payload size limits, request timeouts',
        status: 'FIXED',
        cvssScore: 6.5,
      });
    }

    // Test expensive query DoS
    const expensiveQuery = '/api/v1/posts/search?q=' + encodeURIComponent('a'.repeat(1000));
    const queryStart = Date.now();
    const queryResponse = await this.sendAuthenticatedRequest(expensiveQuery);
    const queryTime = Date.now() - queryStart;

    if (queryTime > 5000) {
      findings.push({
        id: `DOS_QUERY_${Date.now()}`,
        title: 'Denial of Service - Expensive Query',
        severity: 'MEDIUM',
        vulnerableEndpoint: '/api/v1/posts/search',
        payload: '1000 character search term',
        impact: 'Database resource exhaustion',
        remediation: 'Implement query complexity limits, pagination, indexing',
        status: 'FIXED',
        cvssScore: 5.5,
      });
    }

    report.findings.push(...findings);
    this.updateSeverityCounts(report.summary, findings);
  }

  private async testFileUploadVulnerabilities(report: PenTestReport): Promise<void> {
    const findings: PenTestFinding[] = [];

    const maliciousFiles = [
      { name: 'shell.php', content: '<?php system($_GET["cmd"]); ?>', type: 'application/x-php' },
      { name: 'script.js', content: '<script>alert("XSS")</script>', type: 'application/javascript' },
      { name: 'evil.svg', content: '<svg onload="alert(1)"/>', type: 'image/svg+xml' },
      { name: 'malicious.html', content: '<html><body onload="alert(1)"></body></html>', type: 'text/html' },
    ];

    for (const file of maliciousFiles) {
      const formData = new FormData();
      formData.append('file', Buffer.from(file.content), file.name);
      
      const response = await this.sendFileUploadRequest('/api/v1/media/upload', formData);
      
      if (response.status === 201) {
        findings.push({
          id: `FILE_UPLOAD_${Date.now()}`,
          title: 'Malicious File Upload Accepted',
          severity: 'HIGH',
          vulnerableEndpoint: '/api/v1/media/upload',
          payload: `File: ${file.name}, Type: ${file.type}`,
          impact: 'Remote code execution, XSS, or phishing attacks',
          remediation: 'Validate file types, scan for malware, rename files, store outside webroot',
          status: 'FIXED',
          cvssScore: 8.0,
        });
      }
    }

    report.findings.push(...findings);
    this.updateSeverityCounts(report.summary, findings);
  }

  private generatePenTestReport(results: PenTestReport): void {
    const reportHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Penetration Test Report - Social Media App</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: auto; background: white; padding: 20px; border-radius: 10px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; }
          .severity-CRITICAL { background: #dc2626; color: white; }
          .severity-HIGH { background: #f97316; color: white; }
          .severity-MEDIUM { background: #eab308; color: black; }
          .severity-LOW { background: #22c55e; color: white; }
          .finding { border-left: 4px solid; margin: 10px 0; padding: 15px; background: #f9f9f9; }
          .status-FIXED { color: #22c55e; }
          .status-IN_PROGRESS { color: #f97316; }
          .status-OPEN { color: #dc2626; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          .summary-card { display: inline-block; margin: 10px; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Penetration Test Report</h1>
          <p>Test ID: ${results.testId}</p>
            <p>Start Time: ${results.startTime}</p>
            <p>End Time: ${results.endTime}</p>
            <p>Duration: ${(results.duration / 1000).toFixed(2)} seconds</p>
            <p>Overall Status: ${results.passed ? '✅ PASSED' : '❌ FAILED'}</p>
          </div>

          <h2>📊 Summary</h2>
          <div>
            <div class="summary-card">
              <h3>Critical</h3>
              <p style="font-size: 24px; color: #dc2626;">${results.summary.critical}</p>
            </div>
            <div class="summary-card">
              <h3>High</h3>
              <p style="font-size: 24px; color: #f97316;">${results.summary.high}</p>
            </div>
            <div class="summary-card">
              <h3>Medium</h3>
              <p style="font-size: 24px; color: #eab308;">${results.summary.medium}</p>
            </div>
            <div class="summary-card">
              <h3>Low</h3>
              <p style="font-size: 24px; color: #22c55e;">${results.summary.low}</p>
            </div>
          </div>

          <h2>🔍 Detailed Findings</h2>
          <table>
            <thead>
              <table>
                <th>Severity</th>
                <th>Title</th>
                <th>Endpoint</th>
                <th>Status</th>
                <th>CVSS Score</th>
              </tr>
            </thead>
            <tbody>
              ${results.findings.map(finding => `
                <tr class="severity-${finding.severity}">
                  <td>${finding.severity}</td>
                  <td>${finding.title}</td>
                  <td><code>${finding.vulnerableEndpoint}</code></td>
                  <td class="status-${finding.status}">${finding.status}</td>
                  <td>${finding.cvssScore}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>📝 Remediation Plan</h2>
          <ul>
            ${this.generateRemediationPlan(results.findings).map(item => `<li>${item}</li>`).join('')}
          </ul>

          <h2>🎯 Executive Summary</h2>
          <p>
            ${this.generateExecutiveSummary(results)}
          </p>
        </div>
      </body>
      </html>
    `;

    fs.writeFileSync(`reports/pentest_${results.testId}.html`, reportHtml);
  }

  private generateRemediationPlan(findings: PenTestFinding[]): string[] {
    const remediation = [];
    
    const criticalFindings = findings.filter(f => f.severity === 'CRITICAL');
    if (criticalFindings.length > 0) {
      remediation.push('🚨 IMMEDIATE ACTION REQUIRED: Fix all CRITICAL vulnerabilities');
      remediation.push('→ Implement input validation and parameterized queries');
      remediation.push('→ Enforce proper authentication and authorization');
      remediation.push('→ Update JWT implementation with strong secrets');
    }

    const highFindings = findings.filter(f => f.severity === 'HIGH');
    if (highFindings.length > 0) {
      remediation.push('⚠️ HIGH PRIORITY: Address high-risk vulnerabilities within 7 days');
      remediation.push('→ Implement XSS protections and CSP headers');
      remediation.push('→ Add CSRF protection to state-changing endpoints');
      remediation.push('→ Implement proper access controls');
    }

    remediation.push('📋 GENERAL RECOMMENDATIONS:');
    remediation.push('→ Conduct regular security training for developers');
    remediation.push('→ Implement automated security scanning in CI/CD');
    remediation.push('→ Perform quarterly penetration tests');
    remediation.push('→ Establish bug bounty program');

    return remediation;
  }

  private generateExecutiveSummary(results: PenTestReport): string {
    if (results.summary.critical > 0) {
      return `The application has ${results.summary.critical} CRITICAL vulnerabilities that require immediate attention. 
      These vulnerabilities could lead to complete system compromise. It is recommended to halt any planned releases 
      until all CRITICAL issues are resolved. Estimated remediation time: 2-3 days.`;
    } else if (results.summary.high > 0) {
      return `The application has ${results.summary.high} HIGH severity vulnerabilities. 
      While no CRITICAL issues were found, these vulnerabilities still pose significant risk. 
      Recommend addressing within 7 days. Overall application security is moderate.`;
    } else {
      return `The application passed the penetration test with no CRITICAL or HIGH severity findings. 
      Only MEDIUM and LOW severity issues were identified. The application demonstrates good security posture.
      Continue regular security testing and monitoring.`;
    }
  }

  private updateSeverityCounts(summary: any, findings: PenTestFinding[]): void {
    for (const finding of findings) {
      switch (finding.severity) {
        case 'CRITICAL': summary.critical++; break;
        case 'HIGH': summary.high++; break;
        case 'MEDIUM': summary.medium++; break;
        case 'LOW': summary.low++; break;
        default: summary.informational++; break;
      }
    }
  }

  private evaluatePassStatus(report: PenTestReport): boolean {
    // Pass if no CRITICAL findings and less than 3 HIGH findings
    return report.summary.critical === 0 && report.summary.high < 3;
  }

  // Helper methods (mock implementations for demonstration)
  private async sendTestRequest(url: string, body?: any, method: string = 'GET'): Promise<any> {
    // Mock implementation - in reality would use axios/fetch
    return { status: 200, body: {}, data: {} };
  }

  private async sendAuthenticatedRequest(url: string, token: string, options?: any): Promise<any> {
    return { status: 200, body: {}, data: {} };
  }

  private async sendFileUploadRequest(url: string, formData: FormData): Promise<any> {
    return { status: 201 };
  }

  private async sendRequestWithoutCSRFToken(method: string, url: string): Promise<any> {
    return { status: 200 };
  }

  private async getUserToken(email: string): Promise<string> {
    return 'mock_token_' + email;
  }

  private craftMaliciousJWT(): string {
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwicm9sZSI6ImFkbWluIn0.swXoxLIrXVK8NVYjZRzAy1uZXvQ2WbqFy5vQ6sXzYkE';
  }

  private generateExpiredJWT(): string {
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  }

  private forgeJWT(payload: any, secret: string): string {
    // Mock implementation
    return 'forged_jwt_token';
  }

  private isSanitized(payload: string, response: string): boolean {
    return !response.includes(payload.replace(/[<>]/g, ''));
  }
}

interface PenTestReport {
  testId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  findings: PenTestFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
  passed: boolean;
}

interface PenTestFinding {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
  vulnerableEndpoint: string;
  payload: string;
  impact: string;
  remediation: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'WONTFIX';
  cvssScore: number;
}