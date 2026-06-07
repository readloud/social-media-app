#!/bin/bash
set -e

echo "🚀 Deploying to AWS..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
AWS_REGION="ap-southeast-1"
ENVIRONMENT="production"
PROJECT_NAME="social-media-scheduler"

# Load environment variables
source .env.production

# Login to ECR
echo -e "${YELLOW}Logging into ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build and push backend image
echo -e "${YELLOW}Building backend image...${NC}"
docker build -t $PROJECT_NAME-backend -f backend/Dockerfile ./backend

docker tag $PROJECT_NAME-backend:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$PROJECT_NAME-backend:latest

docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$PROJECT_NAME-backend:latest

# Build and push worker image
echo -e "${YELLOW}Building worker image...${NC}"
docker build -t $PROJECT_NAME-worker -f backend/Dockerfile.worker ./backend

docker tag $PROJECT_NAME-worker:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$PROJECT_NAME-worker:latest

docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$PROJECT_NAME-worker:latest

# Build and push frontend image
echo -e "${YELLOW}Building frontend image...${NC}"
docker build -t $PROJECT_NAME-frontend -f frontend/Dockerfile ./frontend

docker tag $PROJECT_NAME-frontend:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$PROJECT_NAME-frontend:latest

docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$PROJECT_NAME-frontend:latest

# Deploy with Terraform
echo -e "${YELLOW}Deploying infrastructure with Terraform...${NC}"
cd terraform/aws
terraform init
terraform plan -out=tfplan
terraform apply tfplan

# Run database migrations
echo -e "${YELLOW}Running database migrations...${NC}"
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
DATABASE_URL="postgresql://$DB_USERNAME:$DB_PASSWORD@$RDS_ENDPOINT/$DB_NAME"

docker run --rm \
  -e DATABASE_URL="$DATABASE_URL" \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$PROJECT_NAME-backend:latest \
  npm run migration:run

# Update ECS service
echo -e "${YELLOW}Updating ECS service...${NC}"
aws ecs update-service \
  --cluster $PROJECT_NAME-cluster \
  --service $PROJECT_NAME-backend-service \
  --force-new-deployment

# Invalidate CloudFront cache
echo -e "${YELLOW}Invalidating CloudFront cache...${NC}"
CLOUDFRONT_ID=$(terraform output -raw cloudfront_id)
aws cloudfront create-invalidation \
  --distribution-id $CLOUDFRONT_ID \
  --paths "/*"

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo -e "Frontend URL: $(terraform output -raw cloudfront_url)"
echo -e "API URL: $(terraform output -raw alb_dns_name)"