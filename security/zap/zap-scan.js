const ZapClient = require('zap-client');
const fs = require('fs');
const path = require('path');

class ZapSecurityScanner {
  constructor() {
    this.zap = new ZapClient({
      apiKey: process.env.ZAP_API_KEY,
      proxy: 'http://localhost:8080',
    });
  }

  async runScan(targetUrl) {
    console.log(`Starting DAST scan against ${targetUrl}`);
    
    try {
      // 1. Spider the application
      await this.zap.spider.scan(targetUrl);
      await this.waitForSpiderCompletion();
      
      // 2. Active scan
      await this.zap.ascan.scan(targetUrl);
      await this.waitForActiveScanCompletion();
      
      // 3. Generate reports
      await this.generateReports();
      
      // 4. Check alerts
      const alerts = await this.getAlerts();
      this.validateAlerts(alerts);
      
      return alerts;
    } catch (error) {
      console.error('ZAP scan failed:', error);
      throw error;
    }
  }
  
  async waitForSpiderCompletion() {
    let status = 'running';
    while (status !== 'success' && status !== 'failed') {
      await this.sleep(5000);
      const response = await this.zap.spider.status();
      status = response.status;
      console.log(`Spider progress: ${response.percent}%`);
    }
  }
  
  async waitForActiveScanCompletion() {
    let status = 'running';
    while (status !== 'success' && status !== 'failed') {
      await this.sleep(10000);
      const response = await this.zap.ascan.status();
      status = response.status;
      console.log(`Active scan progress: ${response.percent}%`);
    }
  }
  
  async generateReports() {
    const formats = ['html', 'json', 'xml'];
    
    for (const format of formats) {
      const report = await this.zap.core.xmlreport();
      fs.writeFileSync(`reports/zap-report.${format}`, report);
    }
  }
  
  async getAlerts() {
    const alerts = await this.zap.core.alerts();
    return JSON.parse(alerts);
  }
  
  validateAlerts(alerts) {
    const criticalAlerts = alerts.filter(a => a.risk === 'High' || a.risk === 'Critical');
    
    if (criticalAlerts.length > 0) {
      console.error(`Found ${criticalAlerts.length} critical vulnerabilities!`);
      criticalAlerts.forEach(alert => {
        console.error(`- ${alert.name}: ${alert.url}`);
      });
      process.exit(1);
    }
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run scan
const scanner = new ZapSecurityScanner();
scanner.runScan(process.env.TARGET_URL || 'http://localhost:3000');