#!/bin/bash
# deploy-all.sh

#!/bin/bash
set -e

echo "🚀 Starting Complete Deployment..."
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load environment variables
source .env.production

# Check prerequisites
check_prerequisites() {
    echo "🔍 Checking prerequisites..."
    
    command -v docker >/dev/null 2>&1 || { echo >&2 "Docker required but not installed"; exit 1; }
    command -v kubectl >/dev/null 2>&1 || { echo >&2 "kubectl required but not installed"; exit 1; }
    command -v terraform >/dev/null 2>&1 || { echo >&2 "Terraform required but not installed"; exit 1; }
    command -v node >/dev/null 2>&1 || { echo >&2 "Node.js required but not installed"; exit 1; }
    command -v npm >/dev/null 2>&1 || { echo >&2 "npm required but not installed"; exit 1; }
    
    echo -e "${GREEN}✅ Prerequisites met${NC}"
}

# Deploy infrastructure
deploy_infrastructure() {
    echo "🏗️ Deploying Infrastructure..."
    
    cd terraform
    terraform init
    terraform plan -out=tfplan
    terraform apply -auto-approve tfplan
    
    # Get outputs
    export DB_ENDPOINT=$(terraform output -raw rds_endpoint)
    export REDIS_ENDPOINT=$(terraform output -raw redis_endpoint)
    export EKS_CLUSTER=$(terraform output -raw eks_cluster_endpoint)
    
    cd ..
    echo -e "${GREEN}✅ Infrastructure deployed${NC}"
}

# Build and push images
build_images() {
    echo "🐳 Building Docker images..."
    
    # Backend
    cd backend
    docker build -t social-media-backend:latest .
    docker tag social-media-backend:latest ${ECR_REGISTRY}/social-media-backend:${TAG}
    docker push ${ECR_REGISTRY}/social-media-backend:${TAG}
    
    # Frontend
    cd ../frontend
    docker build -t social-media-frontend:latest .
    docker tag social-media-frontend:latest ${ECR_REGISTRY}/social-media-frontend:${TAG}
    docker push ${ECR_REGISTRY}/social-media-frontend:${TAG}
    
    cd ..
    echo -e "${GREEN}✅ Images built and pushed${NC}"
}

# Setup Kubernetes
setup_kubernetes() {
    echo "☸️ Setting up Kubernetes..."
    
    # Update kubeconfig
    aws eks update-kubeconfig --name ${EKS_CLUSTER} --region ${AWS_REGION}
    
    # Create namespace
    kubectl create namespace social-media --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply secrets and configmaps
    envsubst < k8s/secret.yaml | kubectl apply -f -
    envsubst < k8s/configmap.yaml | kubectl apply -f -
    
    # Deploy applications
    envsubst < k8s/backend-deployment.yaml | kubectl apply -f -
    envsubst < k8s/worker-deployment.yaml | kubectl apply -f -
    envsubst < k8s/frontend-deployment.yaml | kubectl apply -f -
    
    # Deploy services
    kubectl apply -f k8s/backend-service.yaml
    kubectl apply -f k8s/frontend-service.yaml
    
    # Deploy ingress
    envsubst < k8s/ingress.yaml | kubectl apply -f -
    
    # Wait for deployments
    kubectl rollout status deployment/backend -n social-media --timeout=5m
    kubectl rollout status deployment/worker -n social-media --timeout=5m
    kubectl rollout status deployment/frontend -n social-media --timeout=5m
    
    echo -e "${GREEN}✅ Kubernetes setup complete${NC}"
}

# Setup monitoring
setup_monitoring() {
    echo "📊 Setting up monitoring..."
    
    ./deploy-monitoring.sh
    
    echo -e "${GREEN}✅ Monitoring deployed${NC}"
}

# Run database migrations
run_migrations() {
    echo "🗄️ Running database migrations..."
    
    kubectl exec -it deployment/backend -n social-media -- \
      npm run migration:run
    
    echo -e "${GREEN}✅ Migrations complete${NC}"
}

# Health check
health_check() {
    echo "🏥 Running health checks..."
    
    # API health
    curl -f https://api.yourdomain.com/api/v1/health || exit 1
    
    # Frontend health
    curl -f https://yourdomain.com || exit 1
    
    # Monitoring health
    curl -f http://grafana.yourdomain.com || exit 1
    
    echo -e "${GREEN}✅ All services healthy${NC}"
}

# Print deployment info
print_info() {
    echo ""
    echo "=================================="
    echo -e "${GREEN}🎉 DEPLOYMENT COMPLETE!${NC}"
    echo "=================================="
    echo ""
    echo "Application URLs:"
    echo "  Frontend: https://yourdomain.com"
    echo "  API: https://api.yourdomain.com"
    echo "  Grafana: https://grafana.yourdomain.com"
    echo "  Prometheus: https://prometheus.yourdomain.com"
    echo ""
    echo "Default credentials:"
    echo "  Admin email: admin@socialmedia.com"
    echo "  Admin password: Admin123!"
    echo ""
    echo "Monitoring credentials:"
    echo "  Grafana: admin / ${GRAFANA_PASSWORD}"
    echo ""
    echo "Next steps:"
    echo "  1. Configure DNS records"
    echo "  2. Set up Cloudflare CDN"
    echo "  3. Configure email provider"
    echo "  4. Set up backup schedules"
    echo "  5. Run load tests"
    echo ""
}

# Main execution
main() {
    check_prerequisites
    deploy_infrastructure
    build_images
    setup_kubernetes
    setup_monitoring
    run_migrations
    health_check
    print_info
}

# Run main function
main "$@"