# Input Variables for Germinal Infrastructure

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "eu-central-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "germinal"
}

variable "environment" {
  description = "Deployment environment (development, staging, production)"
  type        = string
  default     = "development"

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be one of: development, staging, production."
  }
}

variable "allowed_origins" {
  description = "Allowed CORS origins for S3 bucket (e.g., your application domains)"
  type        = list(string)
  default     = [
    "http://localhost:5173",
    "http://localhost:4100",
  ]
}

variable "create_backend_resources" {
  description = "Set to false after initial backend setup to avoid recreating state resources"
  type        = bool
  default     = true
}
