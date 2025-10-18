# Postman Collections for E-commerce Microservices

This directory contains Postman collections for testing the event-driven microservices architecture.

## Collections Overview

### 1. **ecom-local.postman_environment.json**
Environment file containing all service URLs and variables:
- `gateway_base_url`: http://localhost:3000
- `user_base_url`: http://localhost:3001
- `product_base_url`: http://localhost:3002
- `order_base_url`: http://localhost:3003
- `notification_base_url`: http://localhost:3004
- `auth_token`: JWT token for authenticated requests
- `admin_token`: JWT token for admin operations
- `user_id`, `product_id`, `order_id`: Dynamic IDs for testing

### 2. **gateway.postman_collection.json**
Tests the API Gateway functionality:
- Health checks
- User registration/login via gateway
- Product listing via gateway
- Order creation via gateway
- Admin operations via gateway
- **NEW**: Notification service health and metrics via gateway
- **NEW**: Event-driven order flow testing

### 3. **user-service.postman_collection.json**
Direct User Service API tests:
- Health checks
- User registration/login
- Profile management
- Admin user creation
- Role management

### 4. **product-service.postman_collection.json**
Direct Product Service API tests:
- Health checks
- Product CRUD operations
- Inventory management
- Admin operations
- Internal inventory reserve/release

### 5. **order-service.postman_collection.json**
Direct Order Service API tests:
- Health checks
- Order CRUD operations
- Order status updates
- **NEW**: Order events debugging
- **NEW**: Outbox events monitoring (Admin)
- **NEW**: Failed event retry (Admin)

### 6. **notification-service.postman_collection.json** ⭐ NEW
Direct Notification Service API tests:
- Health checks
- Queue metrics monitoring
- Test email sending
- Order status update notifications

### 7. **event-driven-tests.postman_collection.json** ⭐ NEW
Comprehensive testing collection for the event-driven architecture:
- **Infrastructure Health Checks**: All services health status
- **User Registration & Authentication**: Complete auth flow
- **Product Management**: Product creation and listing
- **Event-Driven Order Flow**: End-to-end order processing with events
- **Event Monitoring & Debugging**: Queue metrics, outbox events, direct notifications
- **Idempotency Testing**: Duplicate request handling

## Event-Driven Architecture Features Tested

### 🚀 **BullMQ Integration**
- Queue health monitoring via `/metrics` endpoints
- Job processing status (waiting, active, completed, failed)
- Redis connection status

### 🔄 **Transactional Outbox Pattern**
- Events saved to outbox during order creation
- Background publishing of outbox events
- Retry mechanism for failed event publishing
- Admin endpoints for monitoring outbox events

### 🛡️ **Idempotency Guarantees**
- Duplicate order creation prevention
- Duplicate notification sending prevention
- Idempotency key headers for testing

### 📊 **Event Monitoring**
- Real-time queue metrics
- Event processing statistics
- Health check endpoints with Redis status
- Debug endpoints for event inspection

## How to Use

### 1. **Import Collections**
1. Open Postman
2. Import all `.json` files from this directory
3. Select the `ecom-local` environment

### 2. **Start Services**
```bash
# Start infrastructure
docker-compose up -d mongodb redis

# Start all services
bun run dev
```

### 3. **Run Tests**

#### Quick Health Check
Run the "Infrastructure Health Checks" folder from `event-driven-tests.postman_collection.json`

#### Full Event Flow Test
1. Run "User Registration & Authentication" → Login Test User
2. Copy the `token` from response to `auth_token` environment variable
3. Run "Product Management" → Create Test Product
4. Copy the `_id` from response to `product_id` environment variable
5. Run "Event-Driven Order Flow" → Create Order (Triggers Events)
6. Copy the `_id` from response to `order_id` environment variable
7. Monitor events with "Event Monitoring & Debugging" requests

#### Test Idempotency
1. Run "Idempotency Testing" folder requests multiple times
2. Verify that duplicate requests don't create duplicate orders/notifications

### 4. **Monitor Event Processing**

#### Check Queue Metrics
```bash
GET {{notification_base_url}}/metrics
```

#### Check Outbox Events (Admin)
```bash
GET {{order_base_url}}/api/admin/outbox?limit=10
Authorization: Bearer {{admin_token}}
```

#### Check Notification Service Health
```bash
GET {{notification_base_url}}/health
```

## Expected Event Flow

1. **Order Creation** → `ORDER_CREATED` event → Outbox → Notification Queue
2. **Order Status Update** → `ORDER_STATUS_UPDATE` event → Notification Queue
3. **Notification Processing** → Email sent → `NOTIFICATION_SENT` event
4. **Idempotency Check** → Prevents duplicate processing

## Troubleshooting

### Services Not Starting
- Check Docker Desktop is running
- Verify MongoDB and Redis containers: `docker ps`
- Check port availability: `netstat -ano | findstr :300`

### Event Processing Issues
- Check Redis connection: `docker exec ecommerce-redis redis-cli ping`
- Monitor queue metrics: `GET {{notification_base_url}}/metrics`
- Check outbox events: `GET {{order_base_url}}/api/admin/outbox`

### Authentication Issues
- Create admin user first: "Create Admin User" request
- Login and copy token to `admin_token` environment variable
- Use admin token for admin-only endpoints

## Architecture Benefits Demonstrated

✅ **Reliability**: Transactional outbox ensures events are never lost  
✅ **Scalability**: BullMQ handles high-volume event processing  
✅ **Idempotency**: Prevents duplicate processing of events  
✅ **Monitoring**: Real-time metrics and health checks  
✅ **Debugging**: Admin endpoints for event inspection  
✅ **Event-Driven**: Loose coupling between services via events  

The collections demonstrate a production-ready, event-driven microservices architecture with proper error handling, monitoring, and reliability patterns.
