#!/bin/bash

echo "🛡️ Applying security hardening..."

# 1. Enable AWS WAF
aws wafv2 create-web-acl \
  --name social-media-waf \
  --scope REGIONAL \
  --default-action Allow={} \
  --visibility-config CloudWatchMetricsEnabled=true,MetricName=SocialMediaWAF,SampledRequestsEnabled=true

# 2. Configure Security Groups
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxx \
  --protocol tcp \
  --port 5432 \
  --source-group sg-alb

# 3. Enable VPC Flow Logs
aws ec2 create-flow-logs \
  --resource-type VPC \
  --resource-ids vpc-xxx \
  --traffic-type ALL \
  --log-destination-type cloud-watch-logs \
  --log-group-name vpc-flow-logs

# 4. Configure GuardDuty
aws guardduty create-detector --enable

# 5. Enable Security Hub
aws securityhub enable-security-hub

# 6. Configure Secrets rotation
aws secretsmanager rotate-secret \
  --secret-id db-password \
  --rotation-lambda-arn arn:aws:lambda:...

# 7. Enable ECR scanning
aws ecr put-image-scanning-configuration \
  --repository-name social-media-backend \
  --image-scanning-configuration scanOnPush=true

echo "✅ Security hardening complete"
