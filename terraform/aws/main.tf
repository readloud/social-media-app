terraform {
  required_version = ">= 1.0"
  backend "s3" {
    bucket = "social-media-terraform-state"
    key    = "production/terraform.tfstate"
    region = "ap-southeast-1"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Environment = var.environment
      Project     = "social-media-scheduler"
      ManagedBy   = "Terraform"
    }
  }
}

# VPC Configuration
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"

  name = "social-media-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  enable_vpn_gateway = false
  single_nat_gateway = true

  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Environment = var.environment
  }
}

# RDS PostgreSQL with Multi-AZ
module "rds" {
  source = "terraform-aws-modules/rds/aws"
  version = "6.0.0"

  identifier = "social-media-postgres"

  engine               = "postgres"
  engine_version       = "15.3"
  family               = "postgres15"
  major_engine_version = "15"
  instance_class       = "db.t4g.large"

  storage_encrypted = true
  storage_type      = "gp3"
  allocated_storage = 100

  multi_az = true
  
  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result
  port     = 5432

  vpc_security_group_ids = [aws_security_group.rds.id]
  subnet_ids             = module.vpc.database_subnets

  backup_retention_period = 30
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  enabled_cloudwatch_logs_exports = ["postgresql"]
  
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  deletion_protection = true
  
  tags = {
    Environment = var.environment
  }
}

# ElastiCache Redis
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "social-media-redis"
  engine               = "redis"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 2
  parameter_group_name = "default.redis7"
  port                 = 6379
  
  subnet_group_name = aws_elasticache_subnet_group.redis.name
  security_group_ids = [aws_security_group.redis.id]
  
  tags = {
    Environment = var.environment
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "social-media-cluster"
  
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# Backend ECS Service
module "backend_service" {
  source = "terraform-aws-modules/ecs/aws//modules/service"
  version = "5.0.0"

  name        = "social-media-backend"
  cluster_arn = aws_ecs_cluster.main.arn

  cpu    = 1024
  memory = 2048

  container_definitions = {
    backend = {
      image = "${aws_ecr_repository.backend.repository_url}:latest"
      
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "DB_HOST", value = module.rds.db_instance_address },
        { name = "REDIS_HOST", value = aws_elasticache_cluster.redis.cache_nodes[0].address },
      ]
      
      secrets = [
        { name = "DB_PASSWORD", valueFrom = aws_secretsmanager_secret.db_password.arn },
        { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      ]
      
      port_mappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]
      
      health_check = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
      }
    }
  }

  load_balancer = {
    service = {
      target_group_arn = aws_lb_target_group.backend.arn
      container_name   = "backend"
      container_port   = 3000
    }
  }

  subnet_ids = module.vpc.private_subnets
  security_group_rules = {
    alb_ingress = {
      type                     = "ingress"
      from_port                = 3000
      to_port                  = 3000
      protocol                 = "tcp"
      source_security_group_id = aws_security_group.alb.id
    }
    egress_all = {
      type        = "egress"
      from_port   = 0
      to_port     = 0
      protocol    = "-1"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }
}

# Auto-scaling policy
resource "aws_appautoscaling_target" "backend" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${module.backend_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "backend_cpu" {
  name               = "cpu-auto-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.backend.resource_id
  scalable_dimension = aws_appautoscaling_target.backend.scalable_dimension
  service_namespace  = aws_appautoscaling_target.backend.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# S3 Bucket for Media
resource "aws_s3_bucket" "media" {
  bucket = "social-media-media-${var.environment}"
  
  tags = {
    Environment = var.environment
  }
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "archive-old-media"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  
  origin {
    domain_name = aws_s3_bucket_website_configuration.frontend.website_endpoint
    origin_id   = "S3-frontend"
    
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }
  
  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "ALB-backend"
    
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "ALB-backend"

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"]

      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
  }

  # Static assets cache behavior
  ordered_cache_behavior {
    path_pattern     = "/static/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = "ALB-backend"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl                = 86400
    default_ttl            = 86400
    max_ttl                = 31536000
    compress               = true
    viewer_protocol_policy = "redirect-to-https"
  }

  price_class = "PriceClass_100"

  restrictions {
    geo_restriction {
      restriction_type = "whitelist"
      locations        = ["ID", "SG", "MY", "TH", "VN", "PH"]
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = false
    acm_certificate_arn           = aws_acm_certificate.cert.arn
    ssl_support_method            = "sni-only"
    minimum_protocol_version      = "TLSv1.2_2021"
  }

  tags = {
    Environment = var.environment
  }
}

# WAF Web ACL
resource "aws_wafv2_web_acl" "main" {
  name        = "social-media-waf"
  description = "WAF rules for social media app"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "RateLimitAPI"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 1000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitAPI"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "BlockSQLInjection"
    priority = 2

    action {
      block {}
    }

    statement {
      sql_injection_match_statement {
        field_to_match {
          body {}
        }
        text_transformation {
          priority = 1
          type     = "URL_DECODE"
        }
        text_transformation {
          priority = 2
          type     = "HTML_ENTITY_DECODE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "BlockSQLInjection"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "SocialMediaWAF"
    sampled_requests_enabled   = true
  }
}

# Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name = "social-media-db-password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

# Outputs
output "cloudfront_url" {
  value = aws_cloudfront_distribution.frontend.domain_name
}

output "rds_endpoint" {
  value = module.rds.db_instance_address
  sensitive = true
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}