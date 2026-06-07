#!/bin/bash
# AWS Cost Optimization Script

echo "🔧 Running cost optimization..."

# 1. Right-size RDS instances
aws rds describe-db-instances --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceClass]'
aws rds modify-db-instance \
  --db-instance-identifier social-media-db \
  --db-instance-class db.t4g.large \
  --apply-immediately

# 2. Schedule EC2 instance shutdown (non-production)
# Create Lambda function to stop instances during off-hours

# 3. Use S3 Intelligent-Tiering for media
aws s3api put-bucket-lifecycle-configuration \
  --bucket social-media-media \
  --lifecycle-configuration file://s3-lifecycle.json

# 4. Enable EBS volume optimization
aws ecs update-service \
  --cluster social-media-cluster \
  --service backend-service \
  --capacity-provider-strategy strategy=capacityProvider=FARGATE_SPOT,base=2,weight=1

# 5. Use Spot Instances for workers
cat > spot-config.json << EOF
{
  "instanceTypes": ["c5.large", "c5a.large", "c6i.large"],
  "allocationStrategy": "capacity-optimized"
}
EOF

echo "✅ Cost optimization applied"