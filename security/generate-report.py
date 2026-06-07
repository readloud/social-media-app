import json
import os
from datetime import datetime
from jinja2 import Template

def generate_security_dashboard():
    reports = {}
    
    # Load all reports
    report_files = {
        'sast': 'reports/sonarqube-report.json',
        'dependency': 'reports/dependency-audit.json',
        'container': 'reports/trivy-results.sarif',
        'dast': 'reports/zap-report.json',
    }
    
    for key, path in report_files.items():
        if os.path.exists(path):
            with open(path, 'r') as f:
                reports[key] = json.load(f)
    
    # Calculate security score
    score = calculate_security_score(reports)
    
    # Generate HTML report
    html_template = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Security Dashboard - Social Media App</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: auto; background: white; padding: 20px; border-radius: 10px; }
            .score { font-size: 48px; text-align: center; margin: 20px; }
            .critical { color: red; }
            .high { color: orange; }
            .medium { color: yellow; }
            .low { color: green; }
            .card { border: 1px solid #ddd; padding: 15px; margin: 10px; border-radius: 5px; }
            .vulnerability { margin: 5px 0; padding: 10px; background: #f9f9f9; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔒 Security Dashboard - Social Media App</h1>
            <p>Generated: {{ timestamp }}</p>
            
            <div class="score">
                Security Score: <span class="{{ score_class }}">{{ score }}/100</span>
            </div>
            
            <div class="card">
                <h2>📊 Summary</h2>
                <ul>
                    <li>Critical Vulnerabilities: <span class="critical">{{ critical_count }}</span></li>
                    <li>High Vulnerabilities: <span class="high">{{ high_count }}</span></li>
                    <li>Medium Vulnerabilities: <span class="medium">{{ medium_count }}</span></li>
                    <li>Low Vulnerabilities: <span class="low">{{ low_count }}</span></li>
                </ul>
            </div>
            
            <div class="card">
                <h2>🔍 SAST Findings</h2>
                {% for finding in sast_findings %}
                <div class="vulnerability">
                    <strong>{{ finding.rule }}</strong><br>
                    Severity: {{ finding.severity }}<br>
                    File: {{ finding.file }}:{{ finding.line }}<br>
                    {{ finding.message }}
                </div>
                {% endfor %}
            </div>
            
            <div class="card">
                <h2>📦 Dependency Vulnerabilities</h2>
                {% for vuln in dependency_vulns %}
                <div class="vulnerability">
                    <strong>{{ vuln.package }}</strong><br>
                    Severity: {{ vuln.severity }}<br>
                    Fix: {{ vuln.fixAvailable }}
                </div>
                {% endfor %}
            </div>
            
            <div class="card">
                <h2>🐳 Container Security</h2>
                {% for issue in container_issues %}
                <div class="vulnerability">
                    <strong>{{ issue.title }}</strong><br>
                    Severity: {{ issue.severity }}<br>
                    {{ issue.description }}
                </div>
                {% endfor %}
            </div>
            
            <div class="card">
                <h2>🌐 DAST Findings</h2>
                {% for alert in dast_alerts %}
                <div class="vulnerability">
                    <strong>{{ alert.name }}</strong><br>
                    Risk: {{ alert.risk }}<br>
                    URL: {{ alert.url }}<br>
                    {{ alert.description }}
                </div>
                {% endfor %}
            </div>
            
            <div class="card">
                <h2>✅ Recommendations</h2>
                <ul>
                    {% for rec in recommendations %}
                    <li>{{ rec }}</li>
                    {% endfor %}
                </ul>
            </div>
        </div>
    </body>
    </html>
    """
    
    template = Template(html_template)
    html_output = template.render(
        timestamp=datetime.now().isoformat(),
        score=score,
        score_class=get_score_class(score),
        critical_count=reports.get('critical_count', 0),
        high_count=reports.get('high_count', 0),
        medium_count=reports.get('medium_count', 0),
        low_count=reports.get('low_count', 0),
        sast_findings=reports.get('sast_findings', []),
        dependency_vulns=reports.get('dependency_vulns', []),
        container_issues=reports.get('container_issues', []),
        dast_alerts=reports.get('dast_alerts', []),
        recommendations=generate_recommendations(reports)
    )
    
    with open('security-dashboard.html', 'w') as f:
        f.write(html_output)
    
    print("✅ Security dashboard generated: security-dashboard.html")

def calculate_security_score(reports):
    score = 100
    # Deduct points based on vulnerabilities
    score -= reports.get('critical_count', 0) * 10
    score -= reports.get('high_count', 0) * 5
    score -= reports.get('medium_count', 0) * 2
    return max(0, score)

def get_score_class(score):
    if score >= 80: return 'low'
    elif score >= 60: return 'medium'
    elif score >= 40: return 'high'
    else: return 'critical'

def generate_recommendations(reports):
    recommendations = [
        "Enable MFA for all user accounts",
        "Implement regular security training for developers",
        "Set up automated vulnerability scanning in CI/CD",
        "Regularly update dependencies",
        "Implement secrets management solution",
    ]
    
    if reports.get('critical_count', 0) > 0:
        recommendations.insert(0, "🚨 IMMEDIATE ACTION: Fix critical vulnerabilities")
    
    if reports.get('high_count', 0) > 5:
        recommendations.insert(1, "High priority: Remediate high-severity vulnerabilities")
    
    return recommendations

if __name__ == "__main__":
    generate_security_dashboard()