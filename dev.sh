#!/bin/bash

echo "🚀 Starting Germinal in development mode with mock data..."
echo ""
echo "📦 Using mock data - no database required!"
echo "🔥 Hot reload enabled"
echo ""

# Set environment variable to use mock data
export USE_MOCK_DATA=true

# Load .env file if it exists
if [ -f ".env" ]; then
  set -a
  source .env
  set +a
fi

# Check if mock admin credentials are set
if [ -z "$MOCK_ADMIN_EMAIL" ] || [ -z "$MOCK_ADMIN_PASSWORD" ]; then
  echo "⚠️  Mock admin credentials not set"
  echo ""
  echo "To set custom credentials, run with:"
  echo "  MOCK_ADMIN_EMAIL=your@email.com MOCK_ADMIN_PASSWORD=yourpassword ./dev.sh"
  echo ""
  echo "Or enter credentials now:"
  read -p "Admin email: " ADMIN_EMAIL
  read -sp "Admin password (min 8 chars): " ADMIN_PASSWORD
  echo ""
  export MOCK_ADMIN_EMAIL="$ADMIN_EMAIL"
  export MOCK_ADMIN_PASSWORD="$ADMIN_PASSWORD"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  pnpm install
fi

# Start development server
echo "🌟 Starting development server..."
pnpm dev

