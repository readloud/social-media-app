#!/bin/bash
# monitoring/setup.sh

echo "Setting up monitoring stack..."

# Create directories
mkdir -p prometheus/{rules, targets}
mkdir -p grafana/{dashboards,datasources}
mkdir -p alertmanager
mkdir -p loki
mkdir -p promtail

# Set permissions
chmod 755 prometheus grafana alertmanager

# Start monitoring stack
docker-compose -f docker-compose.yml up -d

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 10

# Configure Grafana datasource
curl -X POST -H "Content-Type: application/json" \
  -d '{
    "name": "Prometheus",
    "type": "prometheus",
    "url": "http://prometheus:9090",
    "access": "proxy",
    "isDefault": true
  }' \
  http://admin:${GRAFANA_PASSWORD}@localhost:3001/api/datasources

# Import dashboard
curl -X POST -H "Content-Type: application/json" \
  -d '{
    "dashboard": {
      "id": null,
      "title": "Social Media Monitoring"
    },
    "overwrite": true
  }' \
  http://admin:${GRAFANA_PASSWORD}@localhost:3001/api/dashboards/db

echo "Monitoring stack is ready!"
echo "Grafana: http://localhost:3001 (admin/${GRAFANA_PASSWORD})"
echo "Prometheus: http://localhost:9090"
echo "Alertmanager: http://localhost:9093"