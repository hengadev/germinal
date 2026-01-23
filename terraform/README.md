# Germinal Terraform Configuration

Infrastructure as Code for the Germinal project using Terraform.

## What This Manages

### AWS Resources
- **S3 Bucket**: Media storage for images, videos, and other assets
- **IAM User & Policy**: Programmatic access credentials for the VPS
- **Terraform State**: S3 backend with DynamoDB locking for state management

### Hetzner Cloud Resources
- **VPS Server**: Ubuntu 24.04 with Docker pre-installed
- **SSH Key**: Automatic SSH key management for secure access
- **Firewall**: UFW pre-configured (SSH, HTTP, HTTPS, app port)
- **Backups**: Automatic daily backups enabled

## Prerequisites

### AWS
1. **AWS CLI** installed and configured:
   ```bash
   aws configure
   ```

2. **AWS Credentials** with permissions to create:
   - S3 buckets
   - IAM users and policies
   - DynamoDB tables

### Hetzner Cloud
1. **Hetzner Cloud Account**: Sign up at https://console.hetzner.cloud
2. **API Token**: Create at https://console.hetzner.cloud/projects/YOUR_PROJECT_ID/security/tokens
3. **SSH Key Pair**: Generate if you don't have one:
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   cat ~/.ssh/id_ed25519.pub
   ```

### Terraform
1. **Terraform** installed (>= 1.0):
   ```bash
   terraform version
   ```

## Initial Setup

### Step 1: Configure Variables

Copy the example variables file and customize:

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
```

### Step 2: Create Backend Resources (First Time Only)

The backend S3 bucket and DynamoDB table need to be created before Terraform can use them.

1. **Comment out the backend block** in `main.tf`:
   ```hcl
   # backend "s3" {
   #   ...
   # }
   ```

2. **Initialize and apply**:
   ```bash
   terraform init
   terraform apply
   ```

3. **Uncomment the backend block** in `main.tf`

4. **Reconfigure to use the new backend**:
   ```bash
   terraform init -reconfigure
   ```

5. **Optional**: Comment out the entire `backend.tf` file to prevent accidental recreation:
   ```bash
   mv backend.tf backend.tf.bak
   ```

### Step 3: Apply S3 Resources

```bash
terraform apply
```

## Daily Usage

### View Planned Changes
```bash
terraform plan
```

### Apply Changes
```bash
terraform apply
```

### View Outputs (including credentials)
```bash
terraform output
terraform output iam_access_key_secret  # Sensitive values
```

### View State
```bash
terraform show
```

## Getting the Credentials

After running `terraform apply`, get your S3 credentials:

```bash
terraform output -raw iam_access_key_id
terraform output -raw iam_access_key_secret
```

Or view all outputs at once:
```bash
terraform output
```

Add these to your project's `.env` file:
```bash
S3_BUCKET=development-germinal-media
S3_REGION=eu-central-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

## Makefile Commands

```bash
# Setup
make init          # Initialize Terraform
make validate      # Validate configuration files

# Operations
make plan          # Show planned changes
make apply         # Apply changes
make refresh       # Refresh state file
make show          # Show current state

# Outputs
make output        # Show all outputs
make credentials   # Show AWS S3 credentials
make server-info   # Show VPS connection details

# Server
make server-ssh    # SSH into the VPS
make server-deploy # Show deployment guide

# Destruction
make destroy       # Destroy all resources
make destroy-server # Destroy VPS only
make destroy-backend # Destroy backend resources (careful!)
```

## Project Structure

```
terraform/
├── main.tf                    # Provider and backend configuration
├── backend.tf                 # S3 state backend resources (first time only)
├── s3.tf                      # S3 bucket and IAM resources
├── hetzner.tf                 # Hetzner Cloud server resources
├── cloud-init.yml.tftpl       # Server initialization template
├── variables.tf               # Input variables
├── outputs.tf                 # Output values
├── terraform.tfvars.example   # Example variable values
├── terraform.tfvars           # Your actual values (not in git)
├── Makefile                   # Convenience commands
└── README.md                  # This file
```

## VPS Deployment

After Terraform creates the server, you can deploy the application:

### Option 1: Manual Deployment

```bash
# SSH into the server
make server-ssh
# or: ssh root@<server-ip>

# Clone the repository
cd /opt/germinal
git clone <your-repo-url> .

# Configure environment
cp .env.example .env
nano .env  # Add your S3 credentials and other settings

# Pull and start the Docker image
make image-pull
make prod-start
```

### Option 2: Using the Project Makefile (from local)

```bash
# Build and push the image locally
make image-release

# Then on the VPS:
make deploy
```

### Server Details After Creation

```bash
make server-info
# Output:
# Server: development-germinal
# IPv4: xxx.xxx.xxx.xxx
# IPv6: xxxx:xxxx:xxxx::/64
# Status: running
#
# SSH connection: ssh root@xxx.xxx.xxx.xxx
```

## Security Notes

- **Never commit** `terraform.tfvars` to git (add to `.gitignore`)
- The IAM access key secret is only shown once after creation - save it securely
- Rotate credentials periodically if needed:
  ```bash
  terraform apply -replace=aws_iam_access_key.app_user
  ```

## Troubleshooting

### Backend Already Configured Error
If you see "Backend configuration changed", run:
```bash
terraform init -reconfigure
```

### State Lock Issues
If a state is locked from a failed run:
```bash
terraform force-unlock <LOCK_ID>
```

### Import Existing Resources
If you have existing AWS resources to manage:
```bash
terraform import aws_s3_bucket.media your-bucket-name
```

## Multi-Environment Setup

For separate environments (development, staging, production):

1. Use different directories:
   ```
   terraform/
   ├── development/
   ├── staging/
   └── production/
   ```

2. Or use Terraform workspaces:
   ```bash
   terraform workspace new production
   terraform apply
   ```

3. Update `terraform.tfvars` for each environment
