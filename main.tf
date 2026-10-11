terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  backend "s3" {
    bucket       = "hunterterms-uptime-monitor"
    key          = "uptime-monitor/terraform.tfstate"
    region       = "ap-south-1"
    use_lockfile = true
    encrypt      = true
  }
}

locals {
  lambda_assume_role = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

variable "home_region" {
  type    = string
  default = "ap-south-1"
}

variable "probe_region" {
  type    = list(string)
  default = ["ap-south-1", "eu-west-1", "us-east-1"]
}

provider "aws" {
  region = var.home_region

  default_tags {
    tags = {
      project = "uptime-monitoring"
    }
  }
}
