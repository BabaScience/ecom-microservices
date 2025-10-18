# E-Commerce Microservices Backend

A comprehensive event-driven microservices architecture for e-commerce built with Node.js, TypeScript, and BullMQ.

## Architecture Overview

This project implements a fully event-driven microservices architecture with the following components:

### Core Services
- **API Gateway** (Port 3000) - Entry point for all client requests
- **User Service** (Port 3001) - User management and authentication
- **Product Service** (Port 3002) - Product catalog and inventory management
- **Order Service** (Port 3003) - Order processing with Saga pattern
- **Notification Service** (Port 3004) - Notification orchestration
- **Inventory Service** (Port 3005) - Inventory reservation and management
- **Email Service** (Port 3006) - Email delivery via SendGrid

### Event-Driven Architecture

The system uses BullMQ on Redis for asynchronous communication between services:

- **Order Events** (`order.events`) - Order lifecycle events
- **User Events** (`user.events`) - User registration and updates
- **Inventory Events** (`inventory.events`) - Inventory operations
- **Notification Tasks** (`notification.tasks`) - Email and SMS notifications
- **Payment Events** (`payment.events`) - Payment processing
- **Dead Letter Queue** (`dead-letter-queue`) - Failed job handling

### Saga Pattern Implementation

The Order Service implements the Saga pattern for distributed transactions:

1. **Order Creation Saga**:
   - Order created → Inventory reserved → Payment processed → Order confirmed
   - Compensation: If any step fails, previous steps are rolled back

2. **State Machine**: Each order has a saga state tracking the current step
3. **Compensating Transactions**: Automatic rollback for failed operations
4. **Eventual Consistency**: System maintains consistency through events

## Key Features

- ✅ **Event-Driven Architecture** with BullMQ and Redis
- ✅ **Saga Pattern** for distributed transactions
- ✅ **Dead Letter Queue** for failed job handling
- ✅ **Idempotent Operations** to prevent duplicate processing
- ✅ **Transactional Outbox** pattern for reliable event publishing
- ✅ **Health Checks** for all services
- ✅ **Docker Compose** for easy development setup
- ✅ **TypeScript** for type safety
- ✅ **MongoDB** for data persistence
- ✅ **JWT Authentication** with role-based access

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- Bun (recommended runtime)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ecom-microservices
   ```

2. **Start all services with Docker Compose**
   ```bash
   docker-compose up -d
   ```

3. **Verify services are running**
   ```bash
   # Check service health
   curl http://localhost:3000/health  # API Gateway
   curl http://localhost:3001/health  # User Service
   curl http://localhost:3002/health  # Product Service
   curl http://localhost:3003/health  # Order Service
   curl http://localhost:3004/health  # Notification Service
   curl http://localhost:3005/health  # Inventory Service
   curl http://localhost:3006/health  # Email Service
   ```

4. **Access API Documentation**
   - API Gateway Swagger: http://localhost:3000/api-docs
   - User Service Swagger: http://localhost:3001/api-docs
   - Product Service Swagger: http://localhost:3002/api-docs
   - Order Service Swagger: http://localhost:3003/api-docs

### Environment Variables

Create `.env` file in the root directory:

```env
# Database
MONGODB_URI=mongodb://admin:password@localhost:27017/ecommerce?authSource=admin

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRATION=24h

# SendGrid (for Email Service)
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=noreply@ecommerce.com

# Service URLs
USER_SERVICE_URL=http://localhost:3001
PRODUCT_SERVICE_URL=http://localhost:3002
ORDER_SERVICE_URL=http://localhost:3003
INVENTORY_SERVICE_URL=http://localhost:3005
EMAIL_SERVICE_URL=http://localhost:3006
```

## API Endpoints

### User Service (Port 3001)
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile

### Product Service (Port 3002)
- `GET /api/products` - List products
- `POST /api/products` - Create product (Admin only)
- `GET /api/products/:id` - Get product details
- `PUT /api/products/:id` - Update product (Admin only)
- `DELETE /api/products/:id` - Delete product (Admin only)

### Order Service (Port 3003)
- `POST /api/orders` - Create order
- `GET /api/orders` - List user orders
- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id/cancel` - Cancel order
- `GET /api/dlq/stats` - DLQ statistics (Admin only)
- `POST /api/dlq/retry/:jobId` - Retry failed job (Admin only)

### Inventory Service (Port 3005)
- `GET /health` - Health check
- `GET /metrics` - Queue metrics

### Email Service (Port 3006)
- `GET /health` - Health check

## Event Flow Examples

### Order Creation Flow

```mermaid
sequenceDiagram
    participant Client
    participant OrderService
    participant InventoryService
    participant PaymentService
    participant NotificationService
    participant EmailService

    Client->>OrderService: POST /api/orders
    OrderService->>OrderService: Create order with saga
    OrderService->>InventoryService: Publish order.created event
    InventoryService->>InventoryService: Reserve inventory
    InventoryService->>OrderService: Publish inventory.reserved event
    OrderService->>PaymentService: Publish payment.processed event
    PaymentService->>OrderService: Publish payment.processed event
    OrderService->>NotificationService: Publish order.confirmed event
    NotificationService->>EmailService: Send confirmation email
    OrderService->>Client: Return order details
```

### Order Cancellation Flow

```mermaid
sequenceDiagram
    participant Client
    participant OrderService
    participant InventoryService
    participant NotificationService

    Client->>OrderService: PUT /api/orders/:id/cancel
    OrderService->>OrderService: Update order status to cancelled
    OrderService->>InventoryService: Publish order.cancelled event
    InventoryService->>InventoryService: Release reserved inventory
    OrderService->>NotificationService: Publish order.cancelled event
    NotificationService->>NotificationService: Send cancellation email
    OrderService->>Client: Return updated order
```

## Monitoring and Observability

### Health Checks
All services expose health check endpoints at `/health`:
- Service status
- Database connectivity
- Redis connectivity
- Queue metrics (where applicable)

### Dead Letter Queue Monitoring
- **Stats Endpoint**: `GET /api/dlq/stats` - View DLQ statistics
- **Retry Endpoint**: `POST /api/dlq/retry/:jobId` - Manually retry failed jobs
- **Automatic Alerting**: Critical failures are logged and can trigger alerts

### Queue Metrics
Each service exposes queue metrics:
- Waiting jobs count
- Active jobs count
- Completed jobs count
- Failed jobs count
- Processing rates

## Development

### Local Development

1. **Install dependencies**
   ```bash
   bun install
   ```

2. **Start individual services**
   ```bash
   # Start User Service
   cd apps/user-service
   bun run dev

   # Start Product Service
   cd apps/product-service
   bun run dev

   # Start Order Service
   cd apps/order-service
   bun run dev
   ```

3. **Run tests**
   ```bash
   bun test
   ```

### Project Structure

```
├── apps/
│   ├── api-gateway/          # API Gateway service
│   ├── user-service/         # User management service
│   ├── product-service/      # Product catalog service
│   ├── order-service/        # Order processing service
│   ├── notification-service/  # Notification orchestration
│   ├── inventory-service/    # Inventory management service
│   └── email-service/        # Email delivery service
├── packages/
│   └── shared/               # Shared utilities and types
├── docs/                     # Documentation
├── docker-compose.yml        # Development environment
└── README.md                 # This file
```

## Production Deployment

### Docker Compose Production

1. **Update environment variables** for production
2. **Configure resource limits** in docker-compose.yml
3. **Set up monitoring** and logging
4. **Configure SSL/TLS** termination
5. **Set up backup strategies** for MongoDB and Redis

### Scaling Considerations

- **Horizontal Scaling**: Each service can be scaled independently
- **Queue Scaling**: Increase worker concurrency for high-volume queues
- **Database Scaling**: Use MongoDB replica sets for read scaling
- **Redis Scaling**: Use Redis Cluster for high availability

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For questions and support, please open an issue in the repository.
