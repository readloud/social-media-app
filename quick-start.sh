#!/bin/bash
echo "🚀 Quick Start - Social Media Auto-Schedule App"

# Clone repository
git clone https://github.com/yourusername/social-media-app.git
cd social-media-app

# Install dependencies
echo "Installing dependencies..."
cd backend && npm install
cd ../frontend && npm install
cd ..

# Setup environment
echo "Setting up environment..."
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# Start development environment
echo "Starting development environment..."
docker-compose -f backend/docker-compose.dev.yml up -d

# Run database migrations
echo "Running migrations..."
cd backend
npm run migration:run
npm run seed

# Start development servers
echo "Starting development servers..."
npm run start:dev &  # Backend
cd ../frontend
npm run dev &  # Frontend

echo ""
echo "✅ Development environment ready!"
echo "Backend: http://localhost:3000"
echo "Frontend: http://localhost:3001"
echo "API Docs: http://localhost:3000/api/v1/docs"
echo ""
echo "To stop: docker-compose down && kill %1 %2"