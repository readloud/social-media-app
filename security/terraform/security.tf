terraform {
  required_providers {
    tfsec = {
      source = "tfsec/tfsec"
      version = "~> 0.40"
    }
  }
}

# Security rules
locals {
  security_tags = {
    Environment = "Production"
    SecurityLevel = "High"
    Compliance = "SOC2,ISO27001"
    DataClassification = "Confidential"
  }
}

# Check for unencrypted RDS
resource "aws_db_instance" "main" {
  storage_encrypted = true
  enabled_cloudwatch_logs_exports = ["postgresql"]
  backup_retention_period = 30
  deletion_protection = true
  
  tags = local.security_tags
}

# Check for public S3 buckets
resource "aws_s3_bucket_public_access_block" "secure" {
  bucket = aws_s3_bucket.main.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Network security
resource "aws_security_group" "main" {
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]  # Only internal
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}