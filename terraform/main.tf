terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }
  backend "s3" {
    bucket         = "social-media-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "ap-southeast-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Environment = var.environment
      Project     = "social-media-app"
      ManagedBy   = "terraform"
      CostCenter  = "engineering"
    }
  }
}

# VPC Configuration
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = {
    Name = "social-media-vpc"
  }
}

# Public subnets
resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 1}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  
  map_public_ip_on_launch = true
  
  tags = {
    Name = "public-subnet-${count.index + 1}"
    Tier = "public"
  }
}

# Private subnets
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  
  tags = {
    Name = "private-subnet-${count.index + 1}"
    Tier = "private"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  
  tags = {
    Name = "social-media-igw"
  }
}

# NAT Gateway for private subnets
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  
  tags = {
    Name = "social-media-nat"
  }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  
  tags = {
    Name = "social-media-nat-eip"
  }
}

# Route tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  
  tags = {
    Name = "public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
  
  tags = {
    Name = "private-rt"
  }
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# RDS PostgreSQL
resource "aws_db_instance" "main" {
  identifier     = "social-media-db"
  engine         = "postgres"
  engine_version = "15.3"
  
  instance_class = var.db_instance_class
  
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_encrypted     = true
  storage_type          = "gp3"
  
  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result
  
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  
  backup_retention_period = 30
  backup_window          = "03:00-04:00"
  maintenance_window     = "mon:04:00-mon:05:00"
  
  backup_retention_period = 30
  skip_final_snapshot    = false
  final_snapshot_identifier = "social-media-final-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"
  
  deletion_protection = true
  
  enabled_cloudwatch_logs_exports = ["postgresql"]
  performance_insights_enabled    = true
  performance_insights_retention_period = 7
  
  tags = {
    Name = "social-media-postgres"
  }
}

resource "random_password" "db_password" {
  length  = 24
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = "social-media-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  
  tags = {
    Name = "social-media-db-subnet-group"
  }
}

# ElastiCache Redis
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "social-media-redis"
  engine              = "redis"
  engine_version      = "7.1"
  node_type           = var.redis_node_type
  num_cache_nodes     = 2
  parameter_group_name = "default.redis7"
  port                = 6379
  
  subnet_group_name = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]
  
  tags = {
    Name = "social-media-redis"
  }
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "social-media-redis-subnet-group"
  subnet_ids = aws_subnet.private[*].id
}

# EKS Cluster
resource "aws_eks_cluster" "main" {
  name     = "social-media-eks"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = "1.28"
  
  vpc_config {
    subnet_ids              = aws_subnet.private[*].id
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "social-media-eks"
  }
}

resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "social-media-nodes"
  node_role_arn   = aws_iam_role.eks_nodes.arn
  subnet_ids      = aws_subnet.private[*].id
  
  scaling_config {
    desired_size = 3
    max_size     = 20
    min_size     = 2
  }
  
  instance_types = ["t3.medium", "t3.large"]
  
  update_config {
    max_unavailable = 1
  }
  
  tags = {
    Name = "social-media-node-group"
  }
}

# S3 for media storage
resource "aws_s3_bucket" "media" {
  bucket = "social-media-${var.environment}-${data.aws_caller_identity.current.account_id}"
  
  tags = {
    Name = "social-media-media-bucket"
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  
  rule {
    id     = "transition-to-ia"
    status = "Enabled"
    
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
  }
  
  rule {
    id     = "delete-old"
    status = "Enabled"
    
    expiration {
      days = 365
    }
  }
}

# Security groups
resource "aws_security_group" "rds" {
  name        = "social-media-rds-sg"
  description = "Security group for RDS"
  vpc_id      = aws_vpc.main.id
  
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }
  
  tags = {
    Name = "social-media-rds-sg"
  }
}

resource "aws_security_group" "redis" {
  name        = "social-media-redis-sg"
  description = "Security group for Redis"
  vpc_id      = aws_vpc.main.id
  
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }
  
  tags = {
    Name = "social-media-redis-sg"
  }
}

# IAM roles
resource "aws_iam_role" "eks_cluster" {
  name = "social-media-eks-cluster-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster" {
  role       = aws_iam_role.eks_cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_iam_role" "eks_nodes" {
  name = "social-media-eks-node-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "eks_nodes" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
  ])
  
  role       = aws_iam_role.eks_nodes.name
  policy_arn = each.value
}

# Variables
variable "aws_region" {
  description = "AWS region"
  default     = "ap-southeast-1"
}

variable "environment" {
  description = "Environment name"
  default     = "production"
}

variable "db_instance_class" {
  description = "RDS instance class"
  default     = "db.t3.medium"
}

variable "db_name" {
  description = "Database name"
  default     = "social_media"
}

variable "db_username" {
  description = "Database username"
  default     = "socialmedia"
}

variable "redis_node_type" {
  description = "Redis node type"
  default     = "cache.t3.micro"
}

# Outputs
output "eks_cluster_endpoint" {
  value = aws_eks_cluster.main.endpoint
}

output "rds_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "s3_bucket" {
  value = aws_s3_bucket.media.bucket
}