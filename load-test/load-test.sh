#!/bin/bash
# load-test/run-tests.sh

echo "Starting Load Tests..."

# K6 test
echo "Running K6 test..."
K6_WEB_DASHBOARD=true \
K6_OUT=datadog \
BASE_URL=https://api.yourdomain.com \
k6 run --out csv=results/k6-results.csv k6-script.js

# Artillery test
echo "Running Artillery test..."
artillery run \
  --output results/artillery-report.json \
  --record \
  --key $ARTILLERY_API_KEY \
  artillery-config.yml

# Generate report
artillery report results/artillery-report.json

# Locust test (alternative)
echo "Running Locust test..."
locust -f locustfile.py \
  --host=https://api.yourdomain.com \
  --users=100 \
  --spawn-rate=10 \
  --run-time=10m \
  --headless \
  --html=results/locust-report.html

echo "Load tests completed!"