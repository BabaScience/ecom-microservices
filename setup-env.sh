#!/bin/bash

# Script to create .env files from templates
# Run this script to set up environment variables for all services

echo "Creating .env files for all microservices..."

# Copy templates to .env files
cp apps/user-service/env.template apps/user-service/.env
cp apps/product-service/env.template apps/product-service/.env
cp apps/order-service/env.template apps/order-service/.env
cp apps/api-gateway/env.template apps/api-gateway/.env
cp env.template .env

echo "✅ Created .env files for:"
echo "  - User Service (apps/user-service/.env)"
echo "  - Product Service (apps/product-service/.env)"
echo "  - Order Service (apps/order-service/.env)"
echo "  - API Gateway (apps/api-gateway/.env)"
echo "  - Root (.env)"

echo ""
echo "🔧 You can now customize the .env files as needed."
echo "📝 Remember to change JWT_SECRET in production!"
echo ""
echo "🚀 To start the services:"
echo "  1. Start infrastructure: docker-compose up -d mongodb redis"
echo "  2. Start services: bun dev"
