# Environment Configuration

This document explains how to set up environment variables for the microservices.

## Quick Setup

Run the setup script to create `.env` files from templates:

**Windows (PowerShell):**
```powershell
.\setup-env.ps1
```

**Linux/Mac (Bash):**
```bash
chmod +x setup-env.sh
./setup-env.sh
```

## Environment Files Created

After running the setup script, you'll have:

- `apps/user-service/.env` - User Service configuration
- `apps/product-service/.env` - Product Service configuration  
- `apps/order-service/.env` - Order Service configuration
- `apps/api-gateway/.env` - API Gateway configuration
- `.env` - Root configuration (shared variables)

## Key Environment Variables

### Shared Variables
- `JWT_SECRET` - Secret key for JWT token signing (change in production!)
- `JWT_EXPIRATION` - Token expiration time (default: 24h)
- `NODE_ENV` - Environment mode (development/production)

### Service-Specific Variables
- `USER_SERVICE_PORT=3001` - User Service port
- `PRODUCT_SERVICE_PORT=3002` - Product Service port
- `ORDER_SERVICE_PORT=3003` - Order Service port
- `GATEWAY_PORT=3000` - API Gateway port

### Database Configuration
- `MONGODB_URI` - MongoDB connection string (each service has its own database)
- `REDIS_HOST=localhost` - Redis host for Bull queues
- `REDIS_PORT=6379` - Redis port

### Service URLs (for inter-service communication)
- `USER_SERVICE_URL=http://localhost:3001`
- `PRODUCT_SERVICE_URL=http://localhost:3002`
- `ORDER_SERVICE_URL=http://localhost:3003`

## Database Names

Each service uses its own MongoDB database:
- User Service: `ecommerce_users`
- Product Service: `ecommerce_products`
- Order Service: `ecommerce_orders`

## Production Considerations

⚠️ **Important for Production:**
1. Change `JWT_SECRET` to a strong, random secret
2. Set `NODE_ENV=production`
3. Use proper MongoDB credentials and connection strings
4. Configure proper CORS origins
5. Use environment-specific service URLs

## Manual Setup

If you prefer to create `.env` files manually:

1. Copy the corresponding `env.template` file
2. Rename it to `.env`
3. Customize the values as needed

Example:
```bash
cp apps/user-service/env.template apps/user-service/.env
# Edit apps/user-service/.env with your preferred values
```
