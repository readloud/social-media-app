#!/bin/bash
echo "📊 Deploying Monitoring Stack..."

# Deploy Prometheus
kubectl create namespace monitoring
kubectl apply -f monitoring/prometheus/prometheus.yaml
kubectl apply -f monitoring/prometheus/alertmanager.yaml

# Deploy Grafana
kubectl apply -f monitoring/grafana/grafana.yaml
kubectl apply -f monitoring/grafana/dashboards.yaml

# Deploy Loki for logs
kubectl apply -f monitoring/loki/loki.yaml
kubectl apply -f monitoring/promtail/promtail.yaml

# Deploy Datadog agent (if using Datadog)
kubectl create secret generic datadog-secret \
  --from-literal=api-key=$DATADOG_API_KEY \
  --namespace monitoring
kubectl apply -f monitoring/datadog/datadog-agent.yaml

# Deploy Jaeger for tracing
kubectl apply -f monitoring/jaeger/jaeger.yaml

echo "✅ Monitoring stack deployed"