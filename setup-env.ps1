# PowerShell script to create .env files from templates
# Run this script to set up environment variables for all services

Write-Host "Creating .env files for all microservices..." -ForegroundColor Green

# Copy templates to .env files
Copy-Item "apps/user-service/env.template" "apps/user-service/.env"
Copy-Item "apps/product-service/env.template" "apps/product-service/.env"
Copy-Item "apps/order-service/env.template" "apps/order-service/.env"
Copy-Item "apps/api-gateway/env.template" "apps/api-gateway/.env"
Copy-Item "env.template" ".env"

Write-Host "✅ Created .env files for:" -ForegroundColor Green
Write-Host "  - User Service (apps/user-service/.env)" -ForegroundColor Yellow
Write-Host "  - Product Service (apps/product-service/.env)" -ForegroundColor Yellow
Write-Host "  - Order Service (apps/order-service/.env)" -ForegroundColor Yellow
Write-Host "  - API Gateway (apps/api-gateway/.env)" -ForegroundColor Yellow
Write-Host "  - Root (.env)" -ForegroundColor Yellow

Write-Host ""
Write-Host "🔧 You can now customize the .env files as needed." -ForegroundColor Cyan
Write-Host "📝 Remember to change JWT_SECRET in production!" -ForegroundColor Red
Write-Host ""
Write-Host "🚀 To start the services:" -ForegroundColor Green
Write-Host "  1. Start infrastructure: docker-compose up -d mongodb redis" -ForegroundColor White
Write-Host "  2. Start services: bun dev" -ForegroundColor White
