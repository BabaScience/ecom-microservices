# Microservices E-Commerce Backend Architecture Specification

## Executive Summary

This document delineates a pedagogical microservices architecture engineered for an e-commerce platform backend. The architecture emphasizes foundational microservices patterns while maintaining implementation simplicity to facilitate comprehensive understanding of distributed systems concepts.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Services Specification](#core-services-specification)
3. [Inter-Service Communication](#inter-service-communication)
4. [Data Architecture](#data-architecture)
5. [Asynchronous Processing](#asynchronous-processing)
6. [API Contracts](#api-contracts)
7. [Deployment Strategy](#deployment-strategy)

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```mermaid
graph TB
    Client[Client Applications]
    
    subgraph "API Layer"
        Gateway[API Gateway<br/>Port: 3000<br/>Express + Bun]
    end
    
    subgraph "Core Services"
        UserSvc[User Service<br/>Port: 3001<br/>Express + Bun]
        ProductSvc[Product Service<br/>Port: 3002<br/>Express + Bun]
        OrderSvc[Order Service<br/>Port: 3003<br/>Express + Bun]
        NotificationSvc[Notification Service<br/>Port: 3004<br/>Express + Bun]
    end
    
    subgraph "Data Layer"
        UserDB[(User DB<br/>MongoDB)]
        ProductDB[(Product DB<br/>MongoDB)]
        OrderDB[(Order DB<br/>MongoDB)]
    end
    
    subgraph "Message Queue"
        Redis[(Redis<br/>Bull Queue)]
    end
    
    Client -->|HTTP/REST| Gateway
    Gateway -->|HTTP| UserSvc
    Gateway -->|HTTP| ProductSvc
    Gateway -->|HTTP| OrderSvc
    
    UserSvc --> UserDB
    ProductSvc --> ProductDB
    OrderSvc --> OrderDB
    
    OrderSvc -.->|Enqueue Jobs| Redis
    NotificationSvc -.->|Process Jobs| Redis
    
    style Gateway fill:#4A90E2
    style Redis fill:#DC3545
    style UserSvc fill:#28A745
    style ProductSvc fill:#28A745
    style OrderSvc fill:#28A745
    style NotificationSvc fill:#FFC107
```

### 1.2 Architectural Principles

**Service Autonomy**: Each microservice operates as an independent, self-contained unit with exclusive ownership of its data persistence layer, thereby ensuring loose coupling and high cohesion.

**Single Responsibility**: Services are demarcated along bounded contexts, with each service encapsulating a specific business capability or domain aggregate.

**Database per Service**: The pattern of database-per-service is implemented to prevent coupling through shared data schemas and to enable independent scaling and technology choices.

**Asynchronous Communication**: Non-critical operations leverage message queues (Bull/Redis) to facilitate eventual consistency and improve system resilience.

---

## 2. Core Services Specification

### 2.1 API Gateway Service

**Purpose**: Serves as the singular entry point for client applications, orchestrating request routing, authentication validation, and cross-cutting concerns.

**Technology Stack**:
- Runtime: Bun
- Framework: Express.js
- Port: 3000

**Responsibilities**:
- Request routing and proxying to downstream services
- Authentication token validation (JWT)
- Rate limiting and throttling
- Request/response logging and monitoring
- CORS policy enforcement
- Response aggregation for composite queries

**Key Dependencies**:
```javascript
{
  "express": "^4.18.0",
  "http-proxy-middleware": "^2.0.0",
  "jsonwebtoken": "^9.0.0",
  "express-rate-limit": "^6.0.0",
  "helmet": "^7.0.0"
}
```

### 2.2 User Service

**Purpose**: Manages user authentication, authorization, and profile administration.

**Technology Stack**:
- Runtime: Bun
- Framework: Express.js
- Database: MongoDB
- Port: 3001

**Responsibilities**:
- User registration and credential management
- Authentication (login/logout)
- JWT token generation and validation
- User profile CRUD operations
- Password hashing and security

**Database Schema**:
```javascript
// users collection
{
  _id: ObjectId,
  email: String (unique, indexed),
  passwordHash: String,
  firstName: String,
  lastName: String,
  role: String (enum: ['customer', 'admin']),
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  createdAt: Date,
  updatedAt: Date
}
```

**Key Endpoints**:
- `POST /api/users/register` - User registration
- `POST /api/users/login` - Authentication
- `GET /api/users/profile` - Retrieve user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/:id` - Get user by ID (internal)

### 2.3 Product Service

**Purpose**: Administers product catalog management, inventory tracking, and product information retrieval.

**Technology Stack**:
- Runtime: Bun
- Framework: Express.js
- Database: MongoDB
- Port: 3002

**Responsibilities**:
- Product catalog management (CRUD)
- Inventory level tracking
- Product search and filtering
- Category management
- Product availability validation

**Database Schema**:
```javascript
// products collection
{
  _id: ObjectId,
  name: String (indexed),
  description: String,
  sku: String (unique, indexed),
  price: Number,
  currency: String (default: 'USD'),
  inventory: {
    quantity: Number,
    reserved: Number,
    available: Number (virtual field)
  },
  category: String (indexed),
  images: [String],
  specifications: Object,
  status: String (enum: ['active', 'inactive', 'discontinued']),
  createdAt: Date,
  updatedAt: Date
}
```

**Key Endpoints**:
- `GET /api/products` - List products (with pagination/filtering)
- `GET /api/products/:id` - Get product details
- `POST /api/products` - Create product (admin)
- `PUT /api/products/:id` - Update product (admin)
- `DELETE /api/products/:id` - Delete product (admin)
- `POST /api/products/:id/reserve` - Reserve inventory (internal)
- `POST /api/products/:id/release` - Release inventory (internal)

### 2.4 Order Service

**Purpose**: Orchestrates the complete order lifecycle from creation through fulfillment, coordinating with other services to ensure transactional consistency.

**Technology Stack**:
- Runtime: Bun
- Framework: Express.js
- Database: MongoDB
- Queue: Bull (Redis)
- Port: 3003

**Responsibilities**:
- Order creation and validation
- Order status management
- Payment processing coordination
- Inventory reservation/commitment
- Order history retrieval
- Asynchronous event publishing (notifications)

**Database Schema**:
```javascript
// orders collection
{
  _id: ObjectId,
  orderNumber: String (unique, indexed),
  userId: ObjectId (indexed),
  items: [{
    productId: ObjectId,
    productName: String,
    quantity: Number,
    unitPrice: Number,
    totalPrice: Number
  }],
  subtotal: Number,
  tax: Number,
  shipping: Number,
  total: Number,
  status: String (enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
  shippingAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  paymentInfo: {
    method: String,
    transactionId: String,
    status: String
  },
  createdAt: Date,
  updatedAt: Date,
  statusHistory: [{
    status: String,
    timestamp: Date,
    note: String
  }]
}
```

**Key Endpoints**:
- `POST /api/orders` - Create new order
- `GET /api/orders` - List user orders
- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id/cancel` - Cancel order
- `PUT /api/orders/:id/status` - Update order status (admin)

### 2.5 Notification Service

**Purpose**: Asynchronously processes and dispatches notifications through various channels in response to system events.

**Technology Stack**:
- Runtime: Bun
- Framework: Express.js
- Queue: Bull (Redis)
- Port: 3004

**Responsibilities**:
- Email notification dispatching
- SMS notification sending (placeholder)
- Push notification delivery (placeholder)
- Notification template rendering
- Notification history tracking
- Queue job processing

**Notification Types**:
- Order confirmation
- Order status updates
- Shipping notifications
- Account creation confirmation
- Password reset notifications

**Key Endpoints**:
- `POST /api/notifications/send` - Manual notification trigger (internal)
- `GET /api/notifications/status/:jobId` - Get notification job status

---

## 3. Inter-Service Communication

### 3.1 Communication Patterns

```mermaid
sequenceDiagram
    participant Client
    participant Gateway
    participant UserSvc as User Service
    participant ProductSvc as Product Service
    participant OrderSvc as Order Service
    participant Queue as Bull Queue
    participant NotificationSvc as Notification Service
    
    Client->>Gateway: POST /orders (Create Order)
    Gateway->>Gateway: Validate JWT Token
    Gateway->>UserSvc: GET /users/:id (Verify User)
    UserSvc-->>Gateway: User Details
    
    Gateway->>OrderSvc: POST /orders
    
    OrderSvc->>ProductSvc: POST /products/:id/reserve (Reserve Inventory)
    ProductSvc-->>OrderSvc: Inventory Reserved
    
    OrderSvc->>OrderSvc: Create Order Record
    OrderSvc->>Queue: Enqueue Notification Job
    Queue-->>OrderSvc: Job Queued
    
    OrderSvc-->>Gateway: Order Created (201)
    Gateway-->>Client: Order Response
    
    Queue->>NotificationSvc: Process Notification Job
    NotificationSvc->>NotificationSvc: Send Order Confirmation Email
    NotificationSvc-->>Queue: Job Completed
```

### 3.2 Synchronous Communication (HTTP/REST)

**Pattern**: Request-Response via HTTP

**Use Cases**:
- Gateway to service routing
- Service-to-service queries requiring immediate responses
- User-initiated operations

**Implementation Considerations**:
- Timeout configuration: 5-10 seconds
- Retry logic with exponential backoff
- Circuit breaker pattern for resilience
- Service discovery (environment variables for simplicity)

**Example Configuration**:
```javascript
// Service URLs in API Gateway
const SERVICE_REGISTRY = {
  user: process.env.USER_SERVICE_URL || 'http://localhost:3001',
  product: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002',
  order: process.env.ORDER_SERVICE_URL || 'http://localhost:3003',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004'
};
```

### 3.3 Asynchronous Communication (Message Queue)

**Pattern**: Publish-Subscribe via Bull/Redis

**Use Cases**:
- Order creation notifications
- Status update notifications
- Background processing tasks
- Non-critical operations

**Queue Configuration**:
```javascript
// Queue names
const QUEUES = {
  NOTIFICATIONS: 'notifications',
  ORDER_PROCESSING: 'order-processing'
};

// Job types
const JOB_TYPES = {
  ORDER_CONFIRMATION: 'order-confirmation',
  ORDER_STATUS_UPDATE: 'order-status-update',
  WELCOME_EMAIL: 'welcome-email'
};
```

**Message Schema Example**:
```javascript
{
  type: 'order-confirmation',
  data: {
    orderId: '507f1f77bcf86cd799439011',
    userId: '507f1f77bcf86cd799439012',
    email: 'customer@example.com',
    orderDetails: {
      orderNumber: 'ORD-2024-0001',
      total: 99.99,
      items: [...]
    }
  },
  timestamp: '2024-01-15T10:30:00.000Z',
  retries: 0
}
```

---

## 4. Data Architecture

### 4.1 Database Strategy

```mermaid
graph LR
    subgraph "User Service Domain"
        US[User Service] --> UDB[(Users DB<br/>MongoDB)]
    end
    
    subgraph "Product Service Domain"
        PS[Product Service] --> PDB[(Products DB<br/>MongoDB)]
    end
    
    subgraph "Order Service Domain"
        OS[Order Service] --> ODB[(Orders DB<br/>MongoDB)]
    end
    
    style US fill:#28A745
    style PS fill:#28A745
    style OS fill:#28A745
    style UDB fill:#17A2B8
    style PDB fill:#17A2B8
    style ODB fill:#17A2B8
```

**Principle**: Database per Service - Each service maintains exclusive ownership of its database to ensure data encapsulation and service autonomy.

**Database Naming Convention**:
- User Service: `ecommerce_users`
- Product Service: `ecommerce_products`
- Order Service: `ecommerce_orders`

### 4.2 Data Denormalization Strategy

Orders contain denormalized product information to maintain data integrity and query performance:

**Rationale**: 
- Historical accuracy: Product prices/names may change, but orders reflect purchase-time data
- Query efficiency: Eliminates joins across service boundaries
- Service independence: Order service can operate without Product service for reads

**Implementation**:
```javascript
// In Order Service - denormalized product data
order.items = [{
  productId: product._id,          // Reference for updates
  productName: product.name,        // Denormalized
  quantity: 2,
  unitPrice: product.price,         // Denormalized (historical)
  totalPrice: product.price * 2
}]
```

### 4.3 Data Consistency Approach

**Strong Consistency**: Within service boundaries (single database transactions)

**Eventual Consistency**: Across service boundaries (compensating transactions)

**Example - Order Creation Flow**:
1. Order Service receives create order request
2. Synchronously reserves inventory in Product Service
3. If successful, creates order record
4. Asynchronously triggers notification
5. If inventory reservation fails, returns error (no order created)
6. If order creation fails, releases reserved inventory

---

## 5. Asynchronous Processing

### 5.1 Bull Queue Architecture

```mermaid
graph TB
    subgraph "Producers"
        OrderSvc[Order Service]
        UserSvc[User Service]
    end
    
    subgraph "Message Queue Infrastructure"
        Redis[(Redis Server<br/>Port: 6379)]
        
        subgraph "Bull Queues"
            NQ[Notifications Queue]
            OPQ[Order Processing Queue]
        end
    end
    
    subgraph "Consumers"
        NotificationSvc[Notification Service<br/>Workers: 3]
    end
    
    OrderSvc -->|Add Job| NQ
    UserSvc -->|Add Job| NQ
    Redis --> NQ
    Redis --> OPQ
    NQ -->|Process Job| NotificationSvc
    
    style Redis fill:#DC3545
    style NQ fill:#FFC107
    style OPQ fill:#FFC107
```

### 5.2 Queue Configuration

**Producer Configuration (Order Service)**:
```javascript
import { Queue } from 'bull';

const notificationQueue = new Queue('notifications', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD
  }
});

// Job options
const jobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  },
  removeOnComplete: true,
  removeOnFail: false
};

// Enqueue job
await notificationQueue.add('order-confirmation', {
  orderId: order._id,
  userId: order.userId,
  email: user.email,
  orderDetails: {
    orderNumber: order.orderNumber,
    total: order.total
  }
}, jobOptions);
```

**Consumer Configuration (Notification Service)**:
```javascript
import { Queue, Worker } from 'bull';

const notificationQueue = new Queue('notifications', {
  redis: { host: 'localhost', port: 6379 }
});

const worker = new Worker('notifications', async (job) => {
  const { type, data } = job.data;
  
  switch (type) {
    case 'order-confirmation':
      await sendOrderConfirmationEmail(data);
      break;
    case 'order-status-update':
      await sendStatusUpdateEmail(data);
      break;
    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}, {
  connection: { host: 'localhost', port: 6379 },
  concurrency: 3
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with error: ${err.message}`);
});
```

### 5.3 Job Processing Patterns

**Job Lifecycle States**:
- `waiting`: Job added to queue, awaiting processing
- `active`: Job currently being processed by worker
- `completed`: Job processed successfully
- `failed`: Job processing failed
- `delayed`: Job scheduled for future processing

**Retry Strategy**:
- Maximum attempts: 3
- Backoff: Exponential (2s, 4s, 8s)
- Dead letter queue: Failed jobs after max attempts

---

## 6. API Contracts

### 6.1 Gateway Routes

```mermaid
graph LR
    Gateway[API Gateway :3000]
    
    Gateway -->|/api/users/*| UserSvc[User Service :3001]
    Gateway -->|/api/products/*| ProductSvc[Product Service :3002]
    Gateway -->|/api/orders/*| OrderSvc[Order Service :3003]
    
    style Gateway fill:#4A90E2
```

**Route Mapping**:
```javascript
app.use('/api/users', createProxyMiddleware({ 
  target: 'http://localhost:3001',
  changeOrigin: true 
}));

app.use('/api/products', createProxyMiddleware({ 
  target: 'http://localhost:3002',
  changeOrigin: true 
}));

app.use('/api/orders', createProxyMiddleware({ 
  target: 'http://localhost:3003',
  changeOrigin: true 
}));
```

### 6.2 Authentication Flow

```mermaid
sequenceDiagram
    participant Client
    participant Gateway
    participant UserSvc as User Service
    participant OrderSvc as Order Service
    
    Client->>Gateway: POST /api/users/login
    Gateway->>UserSvc: POST /users/login
    UserSvc->>UserSvc: Validate Credentials
    UserSvc->>UserSvc: Generate JWT Token
    UserSvc-->>Gateway: Token + User Data
    Gateway-->>Client: Token + User Data
    
    Note over Client: Store Token
    
    Client->>Gateway: GET /api/orders (Authorization: Bearer TOKEN)
    Gateway->>Gateway: Verify JWT Token
    Gateway->>Gateway: Extract User ID
    Gateway->>OrderSvc: GET /orders?userId=X
    OrderSvc-->>Gateway: Orders
    Gateway-->>Client: Orders
```

**JWT Token Structure**:
```javascript
{
  header: {
    alg: 'HS256',
    typ: 'JWT'
  },
  payload: {
    userId: '507f1f77bcf86cd799439011',
    email: 'user@example.com',
    role: 'customer',
    iat: 1642089600,
    exp: 1642176000  // 24 hours
  },
  signature: 'HMACSHA256(...)'
}
```

### 6.3 API Response Standards

**Success Response Format**:
```javascript
{
  success: true,
  data: {
    // Response payload
  },
  timestamp: '2024-01-15T10:30:00.000Z'
}
```

**Error Response Format**:
```javascript
{
  success: false,
  error: {
    code: 'PRODUCT_NOT_FOUND',
    message: 'The requested product does not exist',
    details: {
      productId: '507f1f77bcf86cd799439011'
    }
  },
  timestamp: '2024-01-15T10:30:00.000Z'
}
```

**HTTP Status Code Standards**:
- `200 OK`: Successful GET, PUT
- `201 Created`: Successful POST
- `204 No Content`: Successful DELETE
- `400 Bad Request`: Validation errors
- `401 Unauthorized`: Missing/invalid authentication
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict (duplicate)
- `500 Internal Server Error`: Server errors

---

## 7. Deployment Strategy

### 7.1 Container Architecture

```mermaid
graph TB
    subgraph "Docker Compose Environment"
        subgraph "Application Services"
            GW[Gateway Container<br/>gateway:latest]
            US[User Service Container<br/>user-service:latest]
            PS[Product Service Container<br/>product-service:latest]
            OS[Order Service Container<br/>order-service:latest]
            NS[Notification Service Container<br/>notification-service:latest]
        end
        
        subgraph "Data Services"
            MongoDB[(MongoDB Container<br/>mongo:7)]
            Redis[(Redis Container<br/>redis:7)]
        end
        
        GW --> MongoDB
        US --> MongoDB
        PS --> MongoDB
        OS --> MongoDB
        OS --> Redis
        NS --> Redis
    end
    
    style GW fill:#4A90E2
    style US fill:#28A745
    style PS fill:#28A745
    style OS fill:#28A745
    style NS fill:#FFC107
```

### 7.2 Docker Compose Configuration

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  # Infrastructure
  mongodb:
    image: mongo:7
    container_name: ecommerce-mongodb
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    volumes:
      - mongodb_data:/data/db
    networks:
      - ecommerce-network

  redis:
    image: redis:7-alpine
    container_name: ecommerce-redis
    ports:
      - "6379:6379"
    networks:
      - ecommerce-network

  # Application Services
  api-gateway:
    build: ./api-gateway
    container_name: ecommerce-gateway
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - JWT_SECRET=your-secret-key
      - USER_SERVICE_URL=http://user-service:3001
      - PRODUCT_SERVICE_URL=http://product-service:3002
      - ORDER_SERVICE_URL=http://order-service:3003
    depends_on:
      - user-service
      - product-service
      - order-service
    networks:
      - ecommerce-network

  user-service:
    build: ./user-service
    container_name: ecommerce-user-service
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=development
      - MONGODB_URI=mongodb://admin:password@mongodb:27017/ecommerce_users?authSource=admin
      - JWT_SECRET=your-secret-key
    depends_on:
      - mongodb
    networks:
      - ecommerce-network

  product-service:
    build: ./product-service
    container_name: ecommerce-product-service
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=development
      - MONGODB_URI=mongodb://admin:password@mongodb:27017/ecommerce_products?authSource=admin
    depends_on:
      - mongodb
    networks:
      - ecommerce-network

  order-service:
    build: ./order-service
    container_name: ecommerce-order-service
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=development
      - MONGODB_URI=mongodb://admin:password@mongodb:27017/ecommerce_orders?authSource=admin
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - PRODUCT_SERVICE_URL=http://product-service:3002
      - USER_SERVICE_URL=http://user-service:3001
    depends_on:
      - mongodb
      - redis
      - product-service
      - user-service
    networks:
      - ecommerce-network

  notification-service:
    build: ./notification-service
    container_name: ecommerce-notification-service
    ports:
      - "3004:3004"
    environment:
      - NODE_ENV=development
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - SMTP_HOST=smtp.example.com
      - SMTP_PORT=587
      - SMTP_USER=notifications@example.com
      - SMTP_PASS=password
    depends_on:
      - redis
    networks:
      - ecommerce-network

volumes:
  mongodb_data:

networks:
  ecommerce-network:
    driver: bridge
```

### 7.3 Environment Configuration

**Development Environment Variables** (.env):
```bash
# API Gateway
PORT=3000
JWT_SECRET=your-development-secret-key-change-in-production
JWT_EXPIRATION=24h

# Service Discovery
USER_SERVICE_URL=http://localhost:3001
PRODUCT_SERVICE_URL=http://localhost:3002
ORDER_SERVICE_URL=http://localhost:3003
NOTIFICATION_SERVICE_URL=http://localhost:3004

# MongoDB
MONGODB_URI=mongodb://admin:password@localhost:27017/ecommerce?authSource=admin

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Email Configuration (Notification Service)
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your-username
SMTP_PASS=your-password
FROM_EMAIL=noreply@ecommerce.local
```

### 7.4 Service Dockerfile Template

**Dockerfile (for each service)**:
```dockerfile
FROM oven/bun:1

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy application code
COPY . .

# Expose service port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start application
CMD ["bun", "run", "start"]
```

---

## 8. Implementation Guidelines

### 8.1 Project Structure

```
ecommerce-microservices/
├── api-gateway/
│   ├── src/
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── rateLimit.js
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   └── proxy.js
│   │   └── index.js
│   ├── Dockerfile
│   ├── package.json
│   └── .env
├── user-service/
│   ├── src/
│   │   ├── models/
│   │   │   └── User.js
│   │   ├── controllers/
│   │   │   └── userController.js
│   │   ├── routes/
│   │   │   └── userRoutes.js
│   │   ├── middleware/
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
├── product-service/
│   ├── src/
│   │   ├── models/
│   │   │   └── Product.js
│   │   ├── controllers/
│   │   │   └── productController.js
│   │   ├── routes/
│   │   │   └── productRoutes.js
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
├── order-service/
│   ├── src/
│   │   ├── models/
│   │   │   └── Order.js
│   │   ├── controllers/
│   │   │   └── orderController.js
│   │   ├── routes/
│   │   │   └── orderRoutes.js
│   │   ├── queues/
│   │   │   └── notificationQueue.js
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
├── notification-service/
│   ├── src/
│   │   ├── workers/
│   │   │   └── notificationWorker.js
│   │   ├── services/
│   │   │   ├── emailService.js
│   │   │   └── templateService.js
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── README.md
```

### 8.2 Development Workflow

**Initial Setup**:
```bash
# Clone repository
git clone <repository-url>
cd ecommerce-microservices

# Start infrastructure
docker-compose up -d mongodb redis

# Install dependencies for each service
cd api-gateway && bun install
cd ../user-service && bun install
cd ../product-service && bun install
cd ../order-service && bun install
cd ../notification-service && bun install

# Start services (development)
# Terminal 1
cd api-gateway && bun run dev

# Terminal 2
cd user-service && bun run dev

# Terminal 3
cd product-service && bun run dev

# Terminal 4
cd order-service && bun run dev

# Terminal 5
cd notification-service && bun run dev
```

### 8.3 Testing Strategy

**Unit Tests**: Test individual service components in isolation
```javascript
// Example: Product Service unit test
describe('Product Controller', () => {
  test('should create product successfully', async () => {
    const productData = {
      name: 'Test Product',
      price: 29.99,
      sku: 'TEST-001'
    };
    
    const result = await productController.create(productData);
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('Test Product');
  });
});
```

**Integration Tests**: Test service-to-service communication
```javascript
// Example: Order creation integration test
describe('Order Creation Flow', () => {
  test('should create order and reserve inventory', async () => {
    const orderPayload = {
      userId: 'user123',
      items: [{ productId: 'prod123', quantity: 2 }]
    };
    
    const response = await request(orderServiceUrl)
      .post('/orders')
      .send(orderPayload);
    
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('pending');
  });
});
```

**End-to-End Tests**: Test complete user flows through API Gateway

### 8.4 Monitoring and Logging

**Logging Strategy**:
- Structured JSON logging
- Correlation IDs for request tracing
- Log levels: ERROR, WARN, INFO, DEBUG
- Centralized log aggregation (future: ELK Stack)

**Logging Example**:
```javascript
const logger = {
  info: (message, meta = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      service: 'order-service',
      correlationId: meta.correlationId,
      ...meta
    }));
  }
};

// Usage
logger.info('Order created', { 
  orderId: order._id, 
  correlationId: req.headers['x-correlation-id'] 
});
```

**Health Check Endpoints**:
```javascript
// Each service implements
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'order-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

---

## 9. Scalability Considerations

### 9.1 Horizontal Scaling

```mermaid
graph TB
    LB[Load Balancer]
    
    subgraph "Order Service Instances"
        OS1[Order Service Instance 1]
        OS2[Order Service Instance 2]
        OS3[Order Service Instance 3]
    end
    
    subgraph "Shared Infrastructure"
        MongoDB[(MongoDB)]
        Redis[(Redis)]
    end
    
    LB --> OS1
    LB --> OS2
    LB --> OS3
    
    OS1 --> MongoDB
    OS2 --> MongoDB
    OS3 --> MongoDB
    
    OS1 --> Redis
    OS2 --> Redis
    OS3 --> Redis
```

**Scaling Strategy**:
- Stateless services enable horizontal scaling
- Load balancer distributes requests across instances
- Shared MongoDB and Redis for state management
- Bull queue workers can scale independently

### 9.2 Performance Optimization

**Database Indexing**:
```javascript
// User Service indexes
db.users.createIndex({ email: 1 }, { unique: true });

// Product Service indexes
db.products.createIndex({ sku: 1 }, { unique: true });
db.products.createIndex({ category: 1 });
db.products.createIndex({ name: "text" });

// Order Service indexes
db.orders.createIndex({ userId: 1 });
db.orders.createIndex({ orderNumber: 1 }, { unique: true });
db.orders.createIndex({ createdAt: -1 });
```

**Caching Strategy** (Future Enhancement):
- Redis cache for frequently accessed products
- User session caching
- Cache invalidation on updates

---

## 10. Security Considerations

### 10.1 Authentication & Authorization

**JWT Token Security**:
- Use strong secret keys (minimum 256 bits)
- Implement token expiration
- Refresh token mechanism for long sessions
- Token blacklisting for logout

**Password Security**:
```javascript
import bcrypt from 'bcrypt';

// Hash password
const saltRounds = 12;
const passwordHash = await bcrypt.hash(password, saltRounds);

// Verify password
const isValid = await bcrypt.compare(password, storedHash);
```

### 10.2 API Security

**Rate Limiting**:
```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/api/', limiter);
```

**Input Validation**:
- Validate all input data
- Sanitize user inputs
- Use schema validation (Joi, Zod)

**HTTPS/TLS**:
- Enforce HTTPS in production
- Use secure headers (Helmet.js)

---

## 11. Operational Procedures

### 11.1 Deployment Process

**Development to Production Pipeline**:
1. Code commit triggers CI pipeline
2. Automated tests execution
3. Docker image building and tagging
4. Push images to container registry
5. Deploy to staging environment
6. Run integration/E2E tests
7. Manual approval gate
8. Deploy to production
9. Health check validation
10. Rollback capability available

### 11.2 Backup and Recovery

**Database Backup Strategy**:
- Daily automated MongoDB backups
- Retention policy: 30 days
- Point-in-time recovery capability
- Backup verification testing

**Disaster Recovery**:
- Recovery Time Objective (RTO): 1 hour
- Recovery Point Objective (RPO): 24 hours
- Regular disaster recovery drills

---

## 12. Future Enhancements

### 12.1 Advanced Features

**Service Mesh**: Implement Istio or Linkerd for:
- Advanced traffic management
- Service-to-service encryption
- Distributed tracing
- Circuit breaking

**Event Sourcing**: Implement event store for:
- Complete audit trail
- Temporal queries
- Event replay capability

**CQRS Pattern**: Separate read and write models for:
- Optimized query performance
- Independent scaling of reads/writes

**API Versioning**: Implement version management:
- URL-based versioning (/api/v1/, /api/v2/)
- Header-based versioning
- Backward compatibility strategy

### 12.2 Observability Enhancements

**Distributed Tracing**: Implement OpenTelemetry/Jaeger
**Metrics Collection**: Prometheus + Grafana dashboards
**Log Aggregation**: ELK Stack (Elasticsearch, Logstash, Kibana)
**Alerting**: PagerDuty/Opsgenie integration

---

## Conclusion

This specification delineates a foundational microservices architecture engineered for pedagogical efficacy while maintaining production-grade architectural principles. The architecture demonstrates essential microservices patterns including service decomposition, inter-service communication, asynchronous processing, and data management strategies.

The implementation prioritizes comprehensibility and extensibility, establishing a robust foundation for progressive enhancement with advanced distributed systems concepts such as service mesh integration, event sourcing, CQRS, and sophisticated observability frameworks.

This architecture serves as an exemplary template for understanding microservices fundamentals while providing scalable infrastructure for real-world e-commerce operations.