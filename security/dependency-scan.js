const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const execPromise = util.promisify(exec);

class DependencyScanner {
  async runAudit() {
    console.log('📦 Running npm audit...');
    
    try {
      const { stdout, stderr } = await execPromise('npm audit --json');
      const audit = JSON.parse(stdout);
      
      this.processAuditResults(audit);
    } catch (error) {
      if (error.stdout) {
        const audit = JSON.parse(error.stdout);
        this.processAuditResults(audit);
      } else {
        console.error('Audit failed:', error);
      }
    }
  }
  
  processAuditResults(audit) {
    const vulnerabilities = {
      critical: [],
      high: [],
      moderate: [],
      low: [],
    };
    
    for (const [pkg, data] of Object.entries(audit.vulnerabilities || {})) {
      if (data.severity === 'critical') {
        vulnerabilities.critical.push({
          package: pkg,
          severity: data.severity,
          via: data.via,
          fixAvailable: data.fixAvailable,
        });
      } else if (data.severity === 'high') {
        vulnerabilities.high.push({
          package: pkg,
          severity: data.severity,
          via: data.via,
        });
      }
    }
    
    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      totalVulnerabilities: Object.values(vulnerabilities).reduce((a,b) => a + b.length, 0),
      critical: vulnerabilities.critical.length,
      high: vulnerabilities.high.length,
      details: vulnerabilities,
    };
    
    fs.writeFileSync('reports/dependency-audit.json', JSON.stringify(report, null, 2));
    
    if (vulnerabilities.critical.length > 0) {
      console.error(`❌ Found ${vulnerabilities.critical.length} critical vulnerabilities!`);
      process.exit(1);
    }
    
    console.log(`✅ Found ${report.totalVulnerabilities} vulnerabilities (${report.critical} critical, ${report.high} high)`);
  }
  
  async runSnyk() {
    console.log('🔍 Running Snyk scan...');
    
    try {
      const { stdout } = await execPromise('snyk test --json');
      const results = JSON.parse(stdout);
      
      fs.writeFileSync('reports/snyk-report.json', JSON.stringify(results, null, 2));
      
      if (results.vulnerabilities?.some(v => v.severity === 'critical')) {
        console.error('❌ Critical vulnerabilities found by Snyk');
        process.exit(1);
      }
    } catch (error) {
      console.error('Snyk scan failed:', error);
    }
  }
  
  async checkOutdatedPackages() {
    console.log('📅 Checking outdated packages...');
    
    const { stdout } = await execPromise('npm outdated --json');
    const outdated = JSON.parse(stdout || '{}');
    
    const report = {
      timestamp: new Date().toISOString(),
      outdatedCount: Object.keys(outdated).length,
      packages: outdated,
    };
    
    fs.writeFileSync('reports/outdated-packages.json', JSON.stringify(report, null, 2));
    
    if (Object.keys(outdated).length > 10) {
      console.warn(`⚠️ Found ${Object.keys(outdated).length} outdated packages`);
    }
  }
  
  async runLicenseCheck() {
    console.log('📜 Checking licenses...');
    
    const { stdout } = await execPromise('license-checker --json');
    const licenses = JSON.parse(stdout);
    
    const forbiddenLicenses = ['GPL-2.0', 'GPL-3.0', 'AGPL'];
    const violations = [];
    
    for (const [pkg, info] of Object.entries(licenses)) {
      if (forbiddenLicenses.some(license => info.licenses?.includes(license))) {
        violations.push({
          package: pkg,
          license: info.licenses,
        });
      }
    }
    
    if (violations.length > 0) {
      console.error(`❌ Found ${violations.length} packages with forbidden licenses`);
      fs.writeFileSync('reports/license-violations.json', JSON.stringify(violations, null, 2));
      process.exit(1);
    }
  }
  
  async runAll() {
    await this.runAudit();
    await this.runSnyk();
    await this.checkOutdatedPackages();
    await this.runLicenseCheck();
  }
}

const scanner = new DependencyScanner();
scanner.runAll();