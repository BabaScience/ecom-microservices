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

## Prerequisites

### Docker Desktop Required
This microservices architecture requires Docker Desktop to be running for the following services:
- **MongoDB** (Port 27017) - Database for all services
- **Redis** (Port 6379) - Message queue and caching

**Start Infrastructure:**
```bash
docker-compose up -d mongodb redis
```

## Environment Files Created

After running the setup script, you'll have:

- `apps/user-service/.env` - User Service configuration
- `apps/product-service/.env` - Product Service configuration  
- `apps/order-service/.env` - Order Service configuration
- `apps/notification-service/.env` - Notification Service configuration
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
- `NOTIFICATION_SERVICE_PORT=3004` - Notification Service port
- `GATEWAY_PORT=3000` - API Gateway port

### Database Configuration
- `MONGODB_URI` - MongoDB connection string (each service has its own database)
- `REDIS_HOST=localhost` - Redis host for BullMQ queues
- `REDIS_PORT=6379` - Redis port

### Service URLs (for inter-service communication)
- `USER_SERVICE_URL=http://localhost:3001`
- `PRODUCT_SERVICE_URL=http://localhost:3002`
- `ORDER_SERVICE_URL=http://localhost:3003`
- `NOTIFICATION_SERVICE_URL=http://localhost:3004`

## Database Names

Each service uses its own MongoDB database:
- User Service: `ecommerce_users`
- Product Service: `ecommerce_products`
- Order Service: `ecommerce_orders`

## BullMQ Queue Configuration

The architecture uses BullMQ for event-driven communication with the following queues:

### Event Queues
- `order.events` - Order lifecycle events (high priority)
- `user.events` - User lifecycle events (medium priority)
- `inventory.events` - Inventory management events (high priority)
- `payment.events` - Payment processing events (critical priority)

### Task Queues
- `notification.tasks` - Background notification processing (low priority)

### Queue Features
- **Idempotency**: Events are processed exactly once using Redis-based deduplication
- **Retry Logic**: Exponential backoff for failed jobs
- **Dead Letter Queues**: Failed jobs are moved to DLQ after max retries
- **Rate Limiting**: Configurable job processing limits
- **Monitoring**: Health checks and metrics endpoints

## Troubleshooting

### Common Issues

#### 1. Docker Connection Errors
**Error**: `connect ECONNREFUSED 127.0.0.1:6379` or MongoDB authentication failed

**Solution**: 
1. Ensure Docker Desktop is running
2. Start infrastructure services:
   ```bash
   docker-compose up -d mongodb redis
   ```
3. Verify containers are running:
   ```bash
   docker ps
   ```

#### 2. Duplicate Index Warnings
**Error**: `Duplicate schema index on {"orderNumber":1} found`

**Solution**: This has been fixed in the Order model by removing redundant index definitions.

#### 3. Service Startup Issues
**Error**: Services fail to start or connect

**Solution**:
1. Check if all required ports are available (3000-3004)
2. Verify environment variables are set correctly
3. Ensure MongoDB and Redis are accessible
4. Check service logs for specific error messages

#### 4. Event Processing Issues
**Error**: Events not being processed or duplicate processing

**Solution**:
1. Check Redis connection: `redis-cli ping`
2. Verify queue health: `GET /health` endpoint
3. Check idempotency: Events should not be processed multiple times
4. Review worker logs for processing errors

### Health Check Endpoints

Each service provides health check endpoints:

- **API Gateway**: `GET http://localhost:3000/health`
- **User Service**: `GET http://localhost:3001/health`
- **Product Service**: `GET http://localhost:3002/health`
- **Order Service**: `GET http://localhost:3003/health`
- **Notification Service**: `GET http://localhost:3004/health` and `GET http://localhost:3004/metrics`

### Monitoring Queue Health

Check queue metrics:
```bash
curl http://localhost:3004/metrics
```

Expected response:
```json
{
  "success": true,
  "data": {
    "queue": "notification.tasks",
    "metrics": {
      "waiting": 0,
      "active": 0,
      "completed": 10,
      "failed": 0
    }
  }
}
```

## Production Considerations

⚠️ **Important for Production:**
1. Change `JWT_SECRET` to a strong, random secret (minimum 32 characters)
2. Set `NODE_ENV=production`
3. Use proper MongoDB credentials and connection strings
4. Configure proper CORS origins
5. Use environment-specific service URLs
6. Set up Redis password authentication
7. Configure proper queue limits and retry policies
8. Set up monitoring and alerting for queue health
9. Implement proper logging and error tracking
10. Use connection pooling for database connections

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
