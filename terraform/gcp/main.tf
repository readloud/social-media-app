terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Cloud Run for Backend
resource "google_cloud_run_service" "backend" {
  name     = "social-media-backend"
  location = var.region

  template {
    spec {
      containers {
        image = "gcr.io/${var.project_id}/social-media-backend:latest"
        
        env {
          name  = "NODE_ENV"
          value = "production"
        }
        
        env {
          name  = "DB_HOST"
          value = google_sql_database_instance.main.public_ip_address
        }
        
        env {
          name  = "REDIS_HOST"
          value = google_redis_instance.main.host
        }
        
        env {
          name  = "DB_PASSWORD"
          value_source {
            secret_key_ref {
              name  = "db-password"
              key   = "latest"
            }
          }
        }

        resources {
          limits = {
            cpu    = "2"
            memory = "4Gi"
          }
        }
        
        startup_probe {
          initial_delay_seconds = 10
          timeout_seconds       = 5
          period_seconds        = 10
          failure_threshold     = 3
          tcp_socket {
            port = 8080
          }
        }
      }
      
      container_concurrency = 80
      timeout_seconds       = 300
      service_account_name  = google_service_account.cloud_run.email
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  autogenerate_revision_name = true
}

# Auto-scaling for Cloud Run
resource "google_cloud_run_service_iam_member" "public" {
  service  = google_cloud_run_service.backend.name
  location = google_cloud_run_service.backend.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Cloud SQL for PostgreSQL
resource "google_sql_database_instance" "main" {
  name             = "social-media-db"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = "db-custom-2-7680"
    disk_size         = 100
    disk_type         = "PD_SSD"
    disk_autoresize   = true
    availability_type = "REGIONAL"

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
    }

    ip_configuration {
      ipv4_enabled    = true
      private_network = google_compute_network.main.id
      
      authorized_networks {
        name  = "cloud-run-range"
        value = "10.0.0.0/8"
      }
    }

    database_flags {
      name  = "max_connections"
      value = "500"
    }

    database_flags {
      name  = "shared_buffers"
      value = "2457600"
    }
  }

  deletion_protection = true
}

# Memorystore for Redis
resource "google_redis_instance" "main" {
  name           = "social-media-redis"
  tier           = "STANDARD_HA"
  memory_size_gb = 5
  region         = var.region
  
  redis_version     = "REDIS_6_X"
  display_name      = "Social Media Redis"
  reserved_ip_range = "10.0.0.0/29"
  
  auth_enabled  = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  
  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 2
        minutes = 0
      }
    }
  }
}

# GKE Cluster (for workers)
resource "google_container_cluster" "primary" {
  name     = "social-media-cluster"
  location = var.region

  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.main.name
  subnetwork = google_compute_subnetwork.main.name

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  master_authorized_networks_config {
    cidr_blocks {
      cidr_block   = "0.0.0.0/0"
      display_name = "internet"
    }
  }

  addons_config {
    horizontal_pod_autoscaling {
      disabled = false
    }
    http_load_balancing {
      disabled = false
    }
  }

  vertical_pod_autoscaling {
    enabled = true
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }
}

# Node pool for workers
resource "google_container_node_pool" "worker" {
  name       = "worker-pool"
  location   = var.region
  cluster    = google_container_cluster.primary.name
  node_count = 2

  autoscaling {
    min_node_count = 2
    max_node_count = 20
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type = "n2-standard-4"
    
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    metadata = {
      disable-legacy-endpoints = "true"
    }

    labels = {
      environment = "production"
    }

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }
  }
}

# Cloud Storage for Media
resource "google_storage_bucket" "media" {
  name     = "social-media-media-${var.project_id}"
  location = var.region

  uniform_bucket_level_access = true
  
  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  cors {
    origin          = ["https://*.cloudfunctions.net", "https://${google_cloud_run_service.backend.status[0].url}"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }
}

# Deploy script
resource "null_resource" "deploy_backend" {
  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    command = <<-EOT
      gcloud builds submit --tag gcr.io/${var.project_id}/social-media-backend:latest ./backend
      gcloud run deploy social-media-backend \
        --image gcr.io/${var.project_id}/social-media-backend:latest \
        --platform managed \
        --region ${var.region} \
        --memory 4Gi \
        --cpu 2 \
        --concurrency 80 \
        --timeout 300 \
        --port 3000
    EOT
  }
}

# Outputs
output "cloud_run_url" {
  value = google_cloud_run_service.backend.status[0].url
}

output "gke_cluster_endpoint" {
  value = google_container_cluster.primary.endpoint
  sensitive = true
}