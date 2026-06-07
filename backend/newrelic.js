'use strict';

exports.config = {
  app_name: ['Social Media API'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: 'info',
    filepath: '/var/log/newrelic/newrelic.log',
  },
  application_logging: {
    forwarding: {
      enabled: true,
    },
    metrics: {
      enabled: true,
    },
  },
  slow_sql: {
    enabled: true,
    max_samples: 10,
  },
  transaction_tracer: {
    enabled: true,
    transaction_threshold: 0.5, // 500ms
    record_sql: 'obfuscated',
    explain_threshold: 0.5,
  },
  error_collector: {
    enabled: true,
    ignore_status_codes: [404, 401, 403],
  },
  distributed_tracing: {
    enabled: true,
  },
  browser_monitoring: {
    enable: true,
  },
  custom_insights_events: {
    enabled: true,
    max_samples_stored: 1000,
  },
};