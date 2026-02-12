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

### Cloudflare DNS
- **DNS Records**: A/AAAA records pointing to VPS
- **Email DNS**: MX records for Hostinger mailbox, SPF/DMARC for deliverability
- **SES DNS**: Domain verification, DKIM, and MAIL FROM records for Amazon SES API
- **SSL/TLS**: Automatic HTTPS via Cloudflare's Universal SSL
- **DDoS Protection**: Cloudflare's proxy and protection services

## Prerequisites

### Install Terraform

```bash
# Check if already installed
terraform --version

# Install on Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y gnupg software-properties-common
wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform
```

### Install AWS CLI

```bash
# Check if already installed
aws --version

# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
rm -rf aws awscliv2.zip

# Configure credentials
aws configure
# Enter: Access Key ID, Secret Access Key, Region (eu-central-1), Output format (json)
```

### AWS Credentials

You need AWS credentials with permissions to create:
- S3 buckets
- IAM users and policies
- DynamoDB tables
- CloudFront distributions
- ACM certificates
- SES domain identities and configuration

1. Go to [IAM Console](https://console.aws.amazon.com/iam/)
2. Create a new user with programmatic access
3. Attach `AdministratorAccess` policy (or a more restrictive custom policy)
4. Save the Access Key ID and Secret Access Key

### Hetzner Cloud

1. **Hetzner Cloud Account**: Sign up at https://console.hetzner.cloud
2. **API Token**: Create at https://console.hetzner.cloud/projects/YOUR_PROJECT_ID/security/tokens
   - Select Read & Write permissions
3. **SSH Key Pair**: Generate if you don't have one:
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   cat ~/.ssh/germinal.pub
   ```

### Cloudflare
1. **Cloudflare Account**: Sign up at https://dash.cloudflare.com/sign-up
2. **Domain Added**: Add your domain to Cloudflare
3. **Nameservers Updated**: Update your domain's nameservers to Cloudflare's
4. **API Token**: Create at https://dash.cloudflare.com/profile/api-tokens
   - Required permissions: **Zone - DNS - Edit**
   - Zone resources: Include - Specific zone - Your domain
5. **Zone ID**: Found in Cloudflare Dashboard → Your domain → Overview → API section

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
make dns-info      # Show application URL and DNS records
make dns-email     # Show email (Registrar + SES) setup
make dns-verify    # Show Cloudflare dashboard link

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
infrastructure/
└── terraform/
    ├── main.tf                    # Provider and backend configuration
    ├── backend.tf                 # S3 state backend resources (first time only)
    ├── s3.tf                      # S3 media bucket and IAM resources
    ├── backups.tf                 # S3 database backup bucket and lifecycle rules
    ├── cloudfront.tf              # CloudFront CDN for media delivery
    ├── hetzner.tf                 # Hetzner Cloud server resources
    ├── cloudflare.tf              # Cloudflare DNS records
    ├── ses.tf                     # Amazon SES configuration
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

## Database Backups

Terraform creates a dedicated S3 bucket for PostgreSQL database backups with tiered lifecycle rules.

### Backup Retention

| Prefix | → STANDARD_IA | → GLACIER | Delete |
|--------|---------------|-----------|--------|
| `daily/` | 7 days | 30 days | 90 days (configurable) |
| `weekly/` | 14 days | 60 days | 180 days |
| `monthly/` | 30 days | 90 days | 365 days |

### Setup Backup Cron Jobs

After deployment, add these to your VPS crontab (`crontab -e`):

```bash
# Daily backup at 2 AM
0 2 * * * /opt/germinal/scripts/backup-db.sh daily

# Weekly backup on Sunday at 3 AM
0 3 * * 0 /opt/germinal/scripts/backup-db.sh weekly

# Monthly backup on 1st at 4 AM
0 4 1 * * /opt/germinal/scripts/backup-db.sh monthly
```

### Example Backup Script

Create `/opt/germinal/scripts/backup-db.sh`:

```bash
#!/bin/bash
set -e

TYPE=${1:-daily}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="germinal_${TYPE}_${TIMESTAMP}.sql.gz"

# Dump and compress
docker exec postgres pg_dump -U germinal germinal | gzip > /tmp/$FILENAME

# Upload to S3
aws s3 cp /tmp/$FILENAME s3://${BACKUP_S3_BUCKET}/$TYPE/$FILENAME

# Cleanup
rm /tmp/$FILENAME

echo "Backup uploaded: s3://${BACKUP_S3_BUCKET}/$TYPE/$FILENAME"
```

Make it executable:
```bash
chmod +x /opt/germinal/scripts/backup-db.sh
```

### View Backup Information

```bash
terraform output backup_bucket_name
terraform output backup_script_example
```

## DNS and Domain Setup

### Cloudflare Setup

Before running Terraform, ensure your domain is set up on Cloudflare:

1. **Add Domain to Cloudflare**
   - Go to https://dash.cloudflare.com
   - Click "Add a Site" and enter your domain
   - Select the free plan

2. **Update Nameservers**
   - Cloudflare will provide nameservers (e.g., `alice.ns.cloudflare.com`)
   - Update your domain's nameservers at your registrar (Square)
   - Wait for DNS propagation (can take 24-48 hours)

3. **Get Zone ID**
   - In Cloudflare dashboard, go to your domain
   - Scroll to the bottom of the Overview page
   - Copy the "Zone ID"

4. **Create API Token**
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token"
   - Use "Edit zone DNS" template or create custom with:
     - Zone → DNS → Edit
     - Include → Specific zone → Your domain

### Email Setup (Hostinger Business Email + Amazon SES API)

This project uses a two-provider email setup:
- **Sending**: Amazon SES API (`noreply@`) — uses existing IAM credentials, no SMTP
- **Receiving**: Hostinger Business Email (`support@`) — dedicated mailbox

#### Step 1: Configure Hostinger Business Email (Receiving)

1. **Create Mailbox in Hostinger**
   - Go to hPanel → Emails → Set up email
   - Create `support@yourdomain.com` mailbox

2. **Add Hostinger DKIM records** to `terraform.tfvars`:
   ```hcl
   # Standard Hostinger DKIM (3 CNAME records)
   email_dkim_records = {
     "hostingermail-a._domainkey" = {
       type    = "CNAME"
       content = "hostingermail-a.dkim.mail.hostinger.com"
     }
     "hostingermail-b._domainkey" = {
       type    = "CNAME"
       content = "hostingermail-b.dkim.mail.hostinger.com"
     }
     "hostingermail-c._domainkey" = {
       type    = "CNAME"
       content = "hostingermail-c.dkim.mail.hostinger.com"
     }
   }
   ```

3. **Apply DNS Changes**
   ```bash
   terraform apply
   ```

#### Step 2: Set Up Amazon SES (Sending)

Terraform automatically creates the SES domain identity, DKIM authentication,
configuration set, MAIL FROM domain, and all related DNS records in Cloudflare.
After running `terraform apply`, one manual step remains:

1. **Request Production Access**
   - Go to SES Console → Account dashboard
   - Click "Request production access"
   - Fill in use case (transactional), sending rate, and a brief description
   - AWS reviews this (typically 1-2 business days)
   - Required to send emails to non-verified addresses

#### Step 3: Configure Application

The app sends email via the SES API using the same AWS credentials used for S3.
No SMTP credentials are needed. Add to your `.env`:

```bash
# SES API Configuration (uses existing AWS credentials)
AWS_ACCESS_KEY_ID=AKIA...                    # From terraform output
AWS_SECRET_ACCESS_KEY=...                    # From terraform output
SES_FROM_EMAIL=noreply@yourdomain.com
SES_FROM_NAME=Germinal
SES_REGION=eu-central-1                      # Your AWS region
CONTACT_EMAIL=support@yourdomain.com         # Hostinger mailbox
```

#### Test Email Configuration

```bash
make dns-email  # Shows email configuration summary
```

### DNS Records Created

Terraform automatically creates:

| Type | Name | Content | Proxied |
|------|------|---------|---------|
| A | `@` | VPS IPv4 | Yes |
| AAAA | `@` | VPS IPv6 | Yes |
| CNAME | `www` | `@` | Yes |
| MX | `@` | Hostinger MX servers | No |
| TXT | `@` | SPF (dynamic from `email_spf_includes`) | No |
| TXT | `_dmarc` | DMARC (policy from `email_dmarc_policy`) | No |
| TXT | `_amazonses` | SES verification token | No |
| CNAME | `*._domainkey` | SES DKIM (3 records) | No |
| TXT/CNAME | varies | Mailbox provider DKIM (from `email_dkim_records`) | No |
| MX | `mail` | SES MAIL FROM feedback endpoint | No |
| TXT | `mail` | SPF for MAIL FROM subdomain | No |

### View DNS Information

```bash
make dns-info     # Show application URL and records
make dns-email    # Show email configuration
make dns-verify   # Open Cloudflare dashboard
```

## Security Notes

- **Never commit** `terraform.tfvars` to git (add to `.gitignore`)
- The IAM access key secret is only shown once after creation - save it securely
- Rotate credentials periodically if needed:
  ```bash
  terraform apply -replace=aws_iam_access_key.app_user
  ```

## Troubleshooting

### "No configuration files" Error
You're running terraform from the wrong directory. Make sure you're in the terraform folder:
```bash
cd /path/to/germinal/infrastructure/terraform
terraform init
terraform apply
```

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

### Provider Authentication Errors
Verify your credentials are configured correctly:
```bash
# AWS
aws sts get-caller-identity

# Hetzner (test token)
curl -H "Authorization: Bearer YOUR_TOKEN" https://api.hetzner.cloud/v1/servers

# Cloudflare (test token)
curl -H "Authorization: Bearer YOUR_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify
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
   infrastructure/terraform/
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
