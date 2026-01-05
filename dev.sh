#!/bin/bash

echo "🚀 Starting Germinal in development mode with mock data..."
echo ""
echo "📦 Using mock data - no database required!"
echo "🔥 Hot reload enabled"
echo ""

# Set environment variable to use mock data
export USE_MOCK_DATA=true

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  pnpm install
fi

# Start development server
echo "🌟 Starting development server..."
pnpm dev

