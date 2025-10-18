# Microservices E-Commerce Backend Architecture Specification
## Event-Driven Architecture with BullMQ Best Practices

## Executive Summary

This document delineates a pedagogical microservices architecture engineered for an e-commerce platform backend, implementing event-driven patterns using BullMQ. The architecture emphasizes industry best practices for asynchronous communication, including proper queue topology, producer-consumer separation, idempotency guarantees, and distributed transaction patterns. This specification prioritizes both educational clarity and production-grade architectural patterns suitable for scalable distributed systems.

**Key Architectural Paradigms**: Event-Driven Architecture, Database-per-Service, Saga Pattern, Eventual Consistency, Idempotent Operations

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Services Specification](#2-core-services-specification)
3. [BullMQ Event-Driven Architecture](#3-bullmq-event-driven-architecture)
4. [Queue Topology and Event Patterns](#4-queue-topology-and-event-patterns)
5. [BullMQ Best Practices Implementation](#5-bullmq-best-practices-implementation)
6. [Inter-Service Communication Patterns](#6-inter-service-communication-patterns)
7. [Data Architecture](#7-data-architecture)
8. [API Contracts](#8-api-contracts)
9. [Deployment Strategy](#9-deployment-strategy)
10. [Implementation Guidelines](#10-implementation-guidelines)

---

## 1. Architecture Overview

### 1.1 High-Level Event-Driven Architecture

```mermaid
graph TB
    Client[Client Applications]
    
    subgraph "API Layer"
        Gateway[API Gateway<br/>Port: 3000<br/>Bun + Express]
    end
    
    subgraph "Business Services - Producers & Consumers"
        UserSvc[User Service<br/>Port: 3001<br/>Producer + Consumer]
        ProductSvc[Product Service<br/>Port: 3002<br/>Producer + Consumer]
        OrderSvc[Order Service<br/>Port: 3003<br/>Producer + Consumer]
    end
    
    subgraph "Background Services - Consumers Only"
        NotificationSvc[Notification Service<br/>Port: 3004<br/>Consumer]
        InventorySvc[Inventory Service<br/>Port: 3005<br/>Consumer]
        EmailSvc[Email Service<br/>Port: 3006<br/>Consumer]
    end
    
    subgraph "Data Layer - Isolated Databases"
        UserDB[(Users DB<br/>MongoDB)]
        ProductDB[(Products DB<br/>MongoDB)]
        OrderDB[(Orders DB<br/>MongoDB)]
        OutboxDB[(Outbox Pattern<br/>MongoDB)]
    end
    
    subgraph "Event Bus - BullMQ on Redis"
        Redis[(Redis 7<br/>Port: 6379)]
        
        subgraph "Event Queues"
            OrderQ["📋 order.events<br/>(order.created, order.cancelled)"]
            UserQ["👤 user.events<br/>(user.registered, user.updated)"]
            InventoryQ["📦 inventory.events<br/>(inventory.reserved, released)"]
            NotificationQ["📧 notification.tasks<br/>(email, sms, push)"]
            PaymentQ["💳 payment.events<br/>(payment.processed)"]
        end
        
        subgraph "Dead Letter Queues"
            DLQ["☠️ dead-letter-queue<br/>(Failed Jobs)"]
        end
    end
    
    Client -->|Synchronous REST| Gateway
    Gateway -->|HTTP| UserSvc
    Gateway -->|HTTP| ProductSvc
    Gateway -->|HTTP| OrderSvc
    
    UserSvc --> UserDB
    ProductSvc --> ProductDB
    OrderSvc --> OrderDB
    OrderSvc --> OutboxDB
    
    UserSvc -.->|Publish| UserQ
    OrderSvc -.->|Publish| OrderQ
    OrderSvc -.->|Publish| PaymentQ
    ProductSvc -.->|Publish| InventoryQ
    
    Redis --> OrderQ
    Redis --> UserQ
    Redis --> InventoryQ
    Redis --> NotificationQ
    Redis --> PaymentQ
    Redis --> DLQ
    
    OrderQ -.->|Subscribe| NotificationSvc
    OrderQ -.->|Subscribe| InventorySvc
    UserQ -.->|Subscribe| EmailSvc
    InventoryQ -.->|Subscribe| ProductSvc
    PaymentQ -.->|Subscribe| NotificationSvc
    
    NotificationQ -.->|Subscribe| EmailSvc
    
    style Gateway fill:#4A90E2
    style Redis fill:#DC3545
    style UserSvc fill:#28A745
    style ProductSvc fill:#28A745
    style OrderSvc fill:#28A745
    style NotificationSvc fill:#FFC107
    style InventorySvc fill:#17A2B8
    style EmailSvc fill:#FFC107
    style DLQ fill:#6C757D
    style OrderQ fill:#E3F2FD
    style UserQ fill:#E3F2FD
    style InventoryQ fill:#E3F2FD
    style NotificationQ fill:#E3F2FD
    style PaymentQ fill:#E3F2FD
```

### 1.2 Architectural Principles

**Event-Driven Communication**: Services communicate asynchronously through domain events published to BullMQ queues, enabling loose coupling and independent scalability.

**Service Autonomy**: Each microservice operates as an independent, self-contained unit with exclusive ownership of its data persistence layer, event production, and event consumption logic.

**Eventual Consistency**: The architecture embraces eventual consistency across service boundaries, utilizing compensating transactions and the Saga pattern for distributed workflows.

**Idempotent Event Processing**: All event consumers implement idempotency guarantees to ensure safe reprocessing of duplicate events.

**Producer-Consumer Separation**: Clear delineation between services that produce events (business logic services) and services that exclusively consume events (background workers).

**Queue per Domain Context**: Each bounded context maintains dedicated queues to prevent cross-contamination of concerns and enable independent queue configuration.

**Outbox Pattern**: Critical events use the transactional outbox pattern to guarantee reliable event publishing without distributed transactions.

---

## 2. Core Services Specification

### 2.1 API Gateway Service

**Purpose**: Unified entry point for client applications, providing request routing, authentication orchestration, and cross-cutting concerns.

**Technology Stack**:
- Runtime: Bun 1.x
- Framework: Express.js 4.x
- Port: 3000

**Responsibilities**:
- Request routing to downstream services
- JWT token validation and propagation
- Rate limiting (using BullMQ for distributed rate limiting)
- Request correlation ID generation
- API versioning management
- Response transformation and aggregation

**Key Dependencies**:
```json
{
  "express": "^4.18.0",
  "http-proxy-middleware": "^2.0.0",
  "jsonwebtoken": "^9.0.0",
  "express-rate-limit": "^7.0.0",
  "helmet": "^7.1.0",
  "ioredis": "^5.3.0"
}
```

**BullMQ Integration**: None (gateway is synchronous only)

---

### 2.2 User Service (Producer + Consumer)

**Purpose**: Manages user identity, authentication, authorization, and profile administration. Publishes user lifecycle events.

**Technology Stack**:
- Runtime: Bun 1.x
- Framework: Express.js 4.x
- Database: MongoDB
- Message Queue: BullMQ (Producer + Consumer)
- Port: 3001

**Responsibilities**:
- User registration and credential management
- Authentication (JWT token generation)
- User profile CRUD operations
- Password security (bcrypt)
- Publishing user lifecycle events
- Consuming user-related commands

**Event Producer - Published Events**:
```typescript
enum UserEvents {
  USER_REGISTERED = 'user.registered',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  PASSWORD_RESET_REQUESTED = 'user.password_reset_requested'
}
```

**Event Consumer - Subscribed Events**:
```typescript
enum ConsumedEvents {
  ORDER_COMPLETED = 'order.completed'  // Update user statistics
}
```

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
  statistics: {
    totalOrders: Number,
    totalSpent: Number
  },
  createdAt: Date,
  updatedAt: Date,
  version: Number  // Optimistic locking
}
```

**Key Endpoints**:
- `POST /api/users/register` - User registration
- `POST /api/users/login` - Authentication
- `GET /api/users/profile` - Retrieve user profile
- `PUT /api/users/profile` - Update user profile
- `POST /api/users/password-reset` - Request password reset

**BullMQ Queues**:
- Producer: `user.events`
- Consumer: `order.events` (filtered)

---

### 2.3 Product Service (Producer + Consumer)

**Purpose**: Administers product catalog management and publishes product-related events for inventory coordination.

**Technology Stack**:
- Runtime: Bun 1.x
- Framework: Express.js 4.x
- Database: MongoDB
- Message Queue: BullMQ (Producer + Consumer)
- Port: 3002

**Responsibilities**:
- Product catalog management (CRUD)
- Product search and filtering
- Category management
- Publishing product lifecycle events
- Consuming inventory reservation events
- Managing product availability

**Event Producer - Published Events**:
```typescript
enum ProductEvents {
  PRODUCT_CREATED = 'product.created',
  PRODUCT_UPDATED = 'product.updated',
  PRODUCT_DELETED = 'product.deleted',
  INVENTORY_UPDATED = 'inventory.updated'
}
```

**Event Consumer - Subscribed Events**:
```typescript
enum ConsumedEvents {
  INVENTORY_RESERVED = 'inventory.reserved',
  INVENTORY_RELEASED = 'inventory.released',
  ORDER_COMPLETED = 'order.completed'
}
```

**Database Schema**:
```javascript
// products collection
{
  _id: ObjectId,
  name: String (indexed),
  description: String,
  sku: String (unique, indexed),
  price: {
    amount: Number,
    currency: String (default: 'USD')
  },
  inventory: {
    total: Number,
    available: Number,
    reserved: Number
  },
  category: String (indexed),
  images: [String],
  specifications: Object,
  status: String (enum: ['active', 'inactive', 'discontinued']),
  createdAt: Date,
  updatedAt: Date,
  version: Number  // Optimistic locking
}
```

**Key Endpoints**:
- `GET /api/products` - List products (paginated)
- `GET /api/products/:id` - Get product details
- `POST /api/products` - Create product (admin)
- `PUT /api/products/:id` - Update product (admin)
- `DELETE /api/products/:id` - Soft delete product (admin)
- `GET /api/products/search` - Search products

**BullMQ Queues**:
- Producer: `product.events`
- Consumer: `inventory.events`

---

### 2.4 Order Service (Producer + Consumer)

**Purpose**: Orchestrates order lifecycle management, coordinates distributed transactions using Saga pattern, and publishes order events for downstream processing.

**Technology Stack**:
- Runtime: Bun 1.x
- Framework: Express.js 4.x
- Database: MongoDB
- Message Queue: BullMQ (Producer + Consumer)
- Port: 3003

**Responsibilities**:
- Order creation orchestration (Saga coordinator)
- Order status management
- Publishing order lifecycle events
- Implementing outbox pattern for reliable event publishing
- Consuming payment and inventory events
- Managing compensating transactions

**Event Producer - Published Events**:
```typescript
enum OrderEvents {
  ORDER_CREATED = 'order.created',
  ORDER_CONFIRMED = 'order.confirmed',
  ORDER_CANCELLED = 'order.cancelled',
  ORDER_SHIPPED = 'order.shipped',
  ORDER_DELIVERED = 'order.delivered',
  ORDER_FAILED = 'order.failed'
}
```

**Event Consumer - Subscribed Events**:
```typescript
enum ConsumedEvents {
  PAYMENT_PROCESSED = 'payment.processed',
  PAYMENT_FAILED = 'payment.failed',
  INVENTORY_CONFIRMED = 'inventory.confirmed',
  INVENTORY_INSUFFICIENT = 'inventory.insufficient'
}
```

**Database Schema**:
```javascript
// orders collection
{
  _id: ObjectId,
  orderNumber: String (unique, indexed),
  userId: ObjectId (indexed),
  items: [{
    productId: ObjectId,
    productName: String,  // Denormalized
    sku: String,
    quantity: Number,
    unitPrice: Number,    // Historical price
    totalPrice: Number
  }],
  pricing: {
    subtotal: Number,
    tax: Number,
    shipping: Number,
    discount: Number,
    total: Number
  },
  status: String (enum: [
    'pending', 
    'payment_processing',
    'confirmed', 
    'processing', 
    'shipped', 
    'delivered', 
    'cancelled',
    'failed'
  ]),
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
  saga: {
    id: String,           // Saga instance ID
    status: String,       // 'in_progress', 'completed', 'compensating', 'failed'
    currentStep: String,
    completedSteps: [String],
    compensatedSteps: [String]
  },
  createdAt: Date,
  updatedAt: Date,
  version: Number  // Optimistic locking
}

// outbox collection (Transactional Outbox Pattern)
{
  _id: ObjectId,
  aggregateId: ObjectId,      // Order ID
  aggregateType: String,      // 'Order'
  eventType: String,          // 'order.created'
  eventData: Object,          // Event payload
  published: Boolean,         // Publishing status
  publishedAt: Date,
  retryCount: Number,
  createdAt: Date (indexed),
  processedAt: Date
}
```

**Key Endpoints**:
- `POST /api/orders` - Create new order (initiates Saga)
- `GET /api/orders` - List user orders
- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id/cancel` - Cancel order (compensating transaction)
- `PUT /api/orders/:id/status` - Update order status (admin)

**BullMQ Queues**:
- Producer: `order.events`, `inventory.events`
- Consumer: `payment.events`, `inventory.events`

**Saga Implementation**: Order creation follows the orchestration-based Saga pattern with compensating transactions for failure scenarios.

---

### 2.5 Inventory Service (Consumer Only)

**Purpose**: Background service exclusively responsible for processing inventory-related events and maintaining inventory consistency.

**Technology Stack**:
- Runtime: Bun 1.x
- Framework: Express.js 4.x (minimal, for health checks only)
- Message Queue: BullMQ (Consumer)
- Port: 3005

**Responsibilities**:
- Processing inventory reservation requests
- Processing inventory release requests
- Managing inventory locks and reservations
- Publishing inventory confirmation events
- Handling inventory reservation timeouts

**Event Consumer - Subscribed Events**:
```typescript
enum ConsumedEvents {
  ORDER_CREATED = 'order.created',           // Reserve inventory
  ORDER_CANCELLED = 'order.cancelled',       // Release inventory
  ORDER_PAYMENT_FAILED = 'order.payment_failed',  // Release inventory
  INVENTORY_RESERVATION_TIMEOUT = 'inventory.reservation_timeout'
}
```

**Event Producer - Published Events**:
```typescript
enum InventoryEvents {
  INVENTORY_RESERVED = 'inventory.reserved',
  INVENTORY_RELEASED = 'inventory.released',
  INVENTORY_INSUFFICIENT = 'inventory.insufficient',
  INVENTORY_CONFIRMED = 'inventory.confirmed'
}
```

**Processing Logic**:
```typescript
// Inventory reservation with timeout
async function reserveInventory(orderEvent) {
  const { orderId, items } = orderEvent.data;
  
  try {
    // Check availability
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (product.inventory.available < item.quantity) {
        // Publish insufficient inventory event
        await publishEvent('inventory.insufficient', { orderId, productId: item.productId });
        return;
      }
    }
    
    // Reserve with timeout (15 minutes)
    await InventoryReservation.create({
      orderId,
      items,
      status: 'reserved',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });
    
    // Publish success event
    await publishEvent('inventory.reserved', { orderId, items });
    
    // Schedule timeout job
    await inventoryQueue.add(
      'inventory.reservation_timeout',
      { orderId },
      { delay: 15 * 60 * 1000 }  // 15 minutes
    );
  } catch (error) {
    // Handle failure
    await publishEvent('inventory.reservation_failed', { orderId, error: error.message });
  }
}
```

**BullMQ Queues**:
- Consumer: `order.events`, `inventory.events`
- Producer: `inventory.events`

---

### 2.6 Notification Service (Consumer Only)

**Purpose**: Background service for asynchronous notification dispatching across multiple channels.

**Technology Stack**:
- Runtime: Bun 1.x
- Framework: Express.js 4.x (minimal)
- Message Queue: BullMQ (Consumer)
- Email Provider: Nodemailer / SendGrid
- Port: 3004

**Responsibilities**:
- Email notification dispatching
- SMS notification sending (via Twilio)
- Push notification delivery (via Firebase)
- Notification template rendering
- Retry logic for failed notifications
- Notification delivery tracking

**Event Consumer - Subscribed Events**:
```typescript
enum ConsumedEvents {
  ORDER_CREATED = 'order.created',
  ORDER_CONFIRMED = 'order.confirmed',
  ORDER_SHIPPED = 'order.shipped',
  ORDER_DELIVERED = 'order.delivered',
  ORDER_CANCELLED = 'order.cancelled',
  USER_REGISTERED = 'user.registered',
  PASSWORD_RESET_REQUESTED = 'user.password_reset_requested',
  PAYMENT_PROCESSED = 'payment.processed'
}
```

**Notification Types**:
- Order confirmation email
- Order status update email
- Shipping notification email with tracking
- Welcome email on registration
- Password reset email
- Payment confirmation

**BullMQ Queues**:
- Consumer: `order.events`, `user.events`, `notification.tasks`

---

### 2.7 Email Service (Consumer Only)

**Purpose**: Specialized service for reliable email delivery with advanced retry mechanisms and template management.

**Technology Stack**:
- Runtime: Bun 1.x
- Message Queue: BullMQ (Consumer)
- Email Provider: SendGrid / AWS SES
- Template Engine: Handlebars
- Port: 3006

**Responsibilities**:
- Email template rendering
- Email dispatch via SMTP/API
- Bounce and complaint handling
- Email delivery tracking
- Retry logic with exponential backoff

**BullMQ Configuration**:
```typescript
const emailWorker = new Worker('notification.tasks', async (job) => {
  const { type, data } = job.data;
  
  if (type === 'email') {
    await sendEmail(data);
  }
}, {
  connection: redisConnection,
  concurrency: 5,
  limiter: {
    max: 100,          // Max 100 emails
    duration: 60000    // Per minute
  }
});
```

---

## 3. BullMQ Event-Driven Architecture

### 3.1 BullMQ vs Bull - Why Upgrade?

**BullMQ Advantages**:
- **TypeScript Native**: First-class TypeScript support with type-safe APIs
- **Better Performance**: Optimized Redis communication, 2-3x faster than Bull
- **Flow Jobs**: Native support for complex job workflows and dependencies
- **Better Observability**: Enhanced metrics, events, and monitoring capabilities
- **Modern Architecture**: Built on ioredis 5.x with modern Node.js features
- **Active Development**: Actively maintained with regular updates
- **Advanced Features**: Job groups, job scheduling, repeatable jobs, priority queues

### 3.2 Event-Driven Architecture Philosophy

```mermaid
graph LR
    subgraph "Event Production"
        Service[Business Service] --> Outbox[(Outbox Table)]
        Outbox --> Publisher[Outbox Publisher]
        Publisher --> Queue[BullMQ Queue]
    end
    
    subgraph "Event Consumption"
        Queue --> Worker1[Worker Instance 1]
        Queue --> Worker2[Worker Instance 2]
        Queue --> Worker3[Worker Instance 3]
        
        Worker1 --> Process1[Idempotent Processing]
        Worker2 --> Process2[Idempotent Processing]
        Worker3 --> Process3[Idempotent Processing]
    end
    
    subgraph "Failure Handling"
        Process1 -.->|Retry| RetryQueue[Retry Queue]
        Process2 -.->|Retry| RetryQueue
        Process3 -.->|Retry| RetryQueue
        RetryQueue -.->|Max Retries| DLQ[Dead Letter Queue]
    end
    
    style Service fill:#28A745
    style Queue fill:#DC3545
    style Worker1 fill:#FFC107
    style Worker2 fill:#FFC107
    style Worker3 fill:#FFC107
    style DLQ fill:#6C757D
```

**Core Principles**:

1. **Events as First-Class Citizens**: Domain events represent business facts that have occurred
2. **At-Least-Once Delivery**: Events may be delivered multiple times, consumers must be idempotent
3. **Event Ordering**: Within a single queue, events maintain order; across queues, eventual consistency
4. **Decoupled Services**: Producers don't know about consumers, consumers don't know about producers
5. **Scalable Consumption**: Multiple worker instances process events concurrently

### 3.3 Queue Topology Design

```mermaid
graph TB
    subgraph "Domain Event Queues"
        OrderQ[order.events<br/>Priority: High<br/>Concurrency: 10]
        UserQ[user.events<br/>Priority: Medium<br/>Concurrency: 5]
        InventoryQ[inventory.events<br/>Priority: High<br/>Concurrency: 10]
        PaymentQ[payment.events<br/>Priority: Critical<br/>Concurrency: 5]
    end
    
    subgraph "Task Queues"
        NotificationQ[notification.tasks<br/>Priority: Low<br/>Concurrency: 20]
        EmailQ[email.tasks<br/>Priority: Low<br/>Concurrency: 15]
        ReportQ[report.tasks<br/>Priority: Low<br/>Concurrency: 3]
    end
    
    subgraph "System Queues"
        DLQ[dead-letter<br/>Manual Review]
        RetryQ[retry-queue<br/>Exponential Backoff]
    end
    
    OrderQ -.->|Failed| RetryQ
    UserQ -.->|Failed| RetryQ
    InventoryQ -.->|Failed| RetryQ
    PaymentQ -.->|Failed| RetryQ
    NotificationQ -.->|Failed| RetryQ
    
    RetryQ -.->|Max Retries| DLQ
    
    style OrderQ fill:#E3F2FD
    style PaymentQ fill:#FFEBEE
    style NotificationQ fill:#FFF9C4
    style DLQ fill:#6C757D
```

**Queue Design Principles**:

1. **Domain Queues**: One queue per bounded context (orders, users, inventory)
2. **Task Queues**: Queues for background jobs (emails, reports, exports)
3. **Separation by Priority**: Critical operations get dedicated queues
4. **Separation by Latency**: Fast operations separate from slow operations
5. **Dead Letter Queues**: Centralized queue for permanently failed jobs

---

## 4. Queue Topology and Event Patterns

### 4.1 Event Naming Convention

**Pattern**: `<domain>.<entity>.<action>`

**Examples**:
- `order.created` - Order domain, order entity, created action
- `user.registered` - User domain, user entity, registered action
- `inventory.reserved` - Inventory domain, inventory entity, reserved action
- `payment.processed` - Payment domain, payment entity, processed action

**Event Payload Structure**:
```typescript
interface DomainEvent<T> {
  eventId: string;              // Unique event identifier (UUID)
  eventType: string;            // e.g., 'order.created'
  aggregateId: string;          // Entity ID (Order ID, User ID, etc.)
  aggregateType: string;        // Entity type ('Order', 'User')
  occurredAt: string;           // ISO 8601 timestamp
  version: number;              // Event schema version
  correlationId: string;        // Request correlation ID
  causationId: string;          // Parent event ID (for event chains)
  data: T;                      // Event-specific payload
  metadata: {
    userId?: string;            // User who triggered the event
    source: string;             // Service that produced the event
    environment: string;        // 'production', 'staging', 'development'
  };
}
```

**Example - Order Created Event**:
```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "order.created",
  "aggregateId": "507f1f77bcf86cd799439011",
  "aggregateType": "Order",
  "occurredAt": "2024-01-15T10:30:00.000Z",
  "version": 1,
  "correlationId": "c7e3f8d2-1a4b-4e9c-8f2d-3b5a6c7d8e9f",
  "causationId": null,
  "data": {
    "orderNumber": "ORD-2024-0001",
    "userId": "507f1f77bcf86cd799439012",
    "items": [
      {
        "productId": "507f1f77bcf86cd799439013",
        "productName": "Laptop",
        "sku": "LAP-001",
        "quantity": 1,
        "unitPrice": 999.99,
        "totalPrice": 999.99
      }
    ],
    "total": 999.99,
    "status": "pending",
    "shippingAddress": {
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "zipCode": "94102",
      "country": "USA"
    }
  },
  "metadata": {
    "userId": "507f1f77bcf86cd799439012",
    "source": "order-service",
    "environment": "production"
  }
}
```

### 4.2 Queue Configuration Strategy

```typescript
// Queue configuration by type
const QUEUE_CONFIGS = {
  // Critical business events - high priority, low latency
  'order.events': {
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: 100,  // Keep last 100 completed jobs
      removeOnFail: false     // Keep all failed jobs
    },
    limiter: {
      max: 1000,              // Max 1000 jobs
      duration: 1000          // Per second
    }
  },
  
  // Background tasks - lower priority, high throughput
  'notification.tasks': {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: true,
      removeOnFail: 50        // Keep last 50 failures
    },
    limiter: {
      max: 500,               // Max 500 jobs
      duration: 1000          // Per second
    }
  },
  
  // Critical transactional events - maximum reliability
  'payment.events': {
    defaultJobOptions: {
      attempts: 10,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: 1000,
      removeOnFail: false,
      priority: 1             // Highest priority
    }
  }
};
```

### 4.3 Order Creation Saga Pattern with BullMQ

```mermaid
sequenceDiagram
    participant Client
    participant Gateway
    participant OrderSvc as Order Service
    participant OrderDB as Order DB
    participant Outbox as Outbox Table
    participant Queue as BullMQ Queue
    participant InventorySvc as Inventory Service
    participant PaymentSvc as Payment Service
    participant NotificationSvc as Notification Service
    
    Client->>Gateway: POST /orders
    Gateway->>OrderSvc: Create Order Request
    
    Note over OrderSvc: BEGIN SAGA
    
    OrderSvc->>OrderDB: Create Order (status: pending)
    OrderSvc->>Outbox: Insert Event (order.created)
    OrderSvc->>OrderDB: COMMIT TRANSACTION
    OrderSvc-->>Gateway: 201 Created (Order ID)
    Gateway-->>Client: Order Created Response
    
    Note over OrderSvc: Outbox Publisher (Background Process)
    
    Outbox->>Queue: Publish order.created Event
    Outbox->>Outbox: Mark Event as Published
    
    Queue->>InventorySvc: Consume order.created
    InventorySvc->>InventorySvc: Check & Reserve Inventory
    
    alt Inventory Available
        InventorySvc->>Queue: Publish inventory.reserved
        Queue->>OrderSvc: Consume inventory.reserved
        OrderSvc->>OrderDB: Update Order (status: payment_processing)
        OrderSvc->>Outbox: Insert Event (order.payment_requested)
        Outbox->>Queue: Publish order.payment_requested
        
        Queue->>PaymentSvc: Consume order.payment_requested
        PaymentSvc->>PaymentSvc: Process Payment
        
        alt Payment Success
            PaymentSvc->>Queue: Publish payment.processed
            Queue->>OrderSvc: Consume payment.processed
            OrderSvc->>OrderDB: Update Order (status: confirmed)
            OrderSvc->>Outbox: Insert Event (order.confirmed)
            Outbox->>Queue: Publish order.confirmed
            
            Queue->>NotificationSvc: Consume order.confirmed
            NotificationSvc->>NotificationSvc: Send Confirmation Email
            
            Note over OrderSvc: SAGA COMPLETED
        else Payment Failure
            PaymentSvc->>Queue: Publish payment.failed
            Queue->>OrderSvc: Consume payment.failed
            
            Note over OrderSvc: BEGIN COMPENSATION
            
            OrderSvc->>OrderDB: Update Order (status: failed)
            OrderSvc->>Outbox: Insert Event (order.cancelled)
            Outbox->>Queue: Publish order.cancelled
            
            Queue->>InventorySvc: Consume order.cancelled
            InventorySvc->>InventorySvc: Release Reserved Inventory
            InventorySvc->>Queue: Publish inventory.released
            
            Queue->>NotificationSvc: Consume order.cancelled
            NotificationSvc->>NotificationSvc: Send Cancellation Email
            
            Note over OrderSvc: SAGA COMPENSATED
        end
    else Inventory Insufficient
        InventorySvc->>Queue: Publish inventory.insufficient
        Queue->>OrderSvc: Consume inventory.insufficient
        OrderSvc->>OrderDB: Update Order (status: failed)
        OrderSvc->>Outbox: Insert Event (order.failed)
        Outbox->>Queue: Publish order.failed
        
        Queue->>NotificationSvc: Consume order.failed
        NotificationSvc->>NotificationSvc: Send Failure Email
        
        Note over OrderSvc: SAGA FAILED (No Compensation Needed)
    end
```

---

## 5. BullMQ Best Practices Implementation

### 5.1 Idempotent Event Processing

**Problem**: Events may be delivered multiple times due to retries, network issues, or worker crashes.

**Solution**: Implement idempotency keys to ensure events are processed exactly once.

```typescript
// Idempotency middleware for event consumers
class IdempotencyGuard {
  constructor(private redis: Redis) {}
  
  async processIdempotently<T>(
    eventId: string,
    processFn: () => Promise<T>
  ): Promise<T> {
    const idempotencyKey = `idempotency:${eventId}`;
    
    // Check if already processed
    const processed = await this.redis.get(idempotencyKey);
    if (processed) {
      console.log(`Event ${eventId} already processed, skipping`);
      return JSON.parse(processed);
    }
    
    // Process the event
    const result = await processFn();
    
    // Store result with TTL (7 days)
    await this.redis.setex(
      idempotencyKey,
      7 * 24 * 60 * 60,
      JSON.stringify(result)
    );
    
    return result;
  }
}

// Usage in worker
const idempotencyGuard = new IdempotencyGuard(redis);

const worker = new Worker('order.events', async (job) => {
  const event = job.data;
  
  return await idempotencyGuard.processIdempotently(
    event.eventId,
    async () => {
      // Actual event processing logic
      if (event.eventType === 'order.created') {
        return await handleOrderCreated(event);
      }
    }
  );
}, {
  connection: redisConnection
});
```

### 5.2 Transactional Outbox Pattern

**Problem**: Need to ensure events are reliably published without distributed transactions.

**Solution**: Store events in the same database transaction as the business operation, then publish asynchronously.

```typescript
// Outbox implementation in Order Service
class OutboxPublisher {
  private queue: Queue;
  private outboxCollection: Collection;
  
  constructor(queue: Queue, db: Db) {
    this.queue = queue;
    this.outboxCollection = db.collection('outbox');
    
    // Start background publisher
    this.startPublisher();
  }
  
  // Save event to outbox within transaction
  async saveEvent(
    session: ClientSession,
    event: DomainEvent<any>
  ): Promise<void> {
    await this.outboxCollection.insertOne({
      _id: new ObjectId(),
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      eventType: event.eventType,
      eventData: event,
      published: false,
      publishedAt: null,
      retryCount: 0,
      createdAt: new Date()
    }, { session });
  }
  
  // Background process to publish unpublished events
  private startPublisher(): void {
    setInterval(async () => {
      try {
        // Find unpublished events (with limit)
        const events = await this.outboxCollection
          .find({ 
            published: false,
            retryCount: { $lt: 5 }
          })
          .sort({ createdAt: 1 })
          .limit(100)
          .toArray();
        
        for (const outboxEvent of events) {
          try {
            // Publish to BullMQ
            await this.queue.add(
              outboxEvent.eventType,
              outboxEvent.eventData,
              {
                jobId: outboxEvent.eventId,  // Deduplicate on BullMQ side
                removeOnComplete: true
              }
            );
            
            // Mark as published
            await this.outboxCollection.updateOne(
              { _id: outboxEvent._id },
              {
                $set: {
                  published: true,
                  publishedAt: new Date()
                }
              }
            );
            
            console.log(`Published event ${outboxEvent.eventId}`);
          } catch (error) {
            // Increment retry count
            await this.outboxCollection.updateOne(
              { _id: outboxEvent._id },
              { $inc: { retryCount: 1 } }
            );
            
            console.error(`Failed to publish event ${outboxEvent.eventId}:`, error);
          }
        }
      } catch (error) {
        console.error('Outbox publisher error:', error);
      }
    }, 5000); // Poll every 5 seconds
  }
}

// Usage in Order Service
async function createOrder(orderData: CreateOrderDto): Promise<Order> {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // 1. Create order in database
    const order = await Order.create([orderData], { session });
    
    // 2. Create event
    const event: DomainEvent<OrderCreatedData> = {
      eventId: uuid(),
      eventType: 'order.created',
      aggregateId: order[0]._id.toString(),
      aggregateType: 'Order',
      occurredAt: new Date().toISOString(),
      version: 1,
      correlationId: getCorrelationId(),
      causationId: null,
      data: {
        orderNumber: order[0].orderNumber,
        userId: order[0].userId,
        items: order[0].items,
        total: order[0].pricing.total
      },
      metadata: {
        source: 'order-service',
        environment: process.env.NODE_ENV
      }
    };
    
    // 3. Save event to outbox (within same transaction)
    await outboxPublisher.saveEvent(session, event);
    
    // 4. Commit transaction
    await session.commitTransaction();
    
    return order[0];
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

### 5.3 Worker Configuration Best Practices

```typescript
import { Worker, Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

// Shared Redis connection (best practice)
const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,  // Required for BullMQ
  enableReadyCheck: false      // Required for BullMQ
});

// Queue configuration
const orderEventsQueue = new Queue('order.events', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: {
      count: 100,        // Keep last 100 completed jobs
      age: 3600         // Remove completed jobs after 1 hour
    },
    removeOnFail: {
      count: 1000       // Keep last 1000 failed jobs
    }
  }
});

// Worker with best practices
const orderEventsWorker = new Worker('order.events', async (job) => {
  console.log(`Processing job ${job.id} of type ${job.name}`);
  
  const event = job.data;
  
  // Idempotency check
  const processed = await checkIfProcessed(event.eventId);
  if (processed) {
    console.log(`Event ${event.eventId} already processed`);
    return { status: 'duplicate', eventId: event.eventId };
  }
  
  // Route to appropriate handler
  switch (event.eventType) {
    case 'order.created':
      return await handleOrderCreated(event);
    case 'order.cancelled':
      return await handleOrderCancelled(event);
    default:
      throw new Error(`Unknown event type: ${event.eventType}`);
  }
}, {
  connection: redisConnection,
  
  // Concurrency - number of jobs processed in parallel
  concurrency: 10,
  
  // Rate limiting
  limiter: {
    max: 100,          // Max 100 jobs
    duration: 1000     // Per second
  },
  
  // Automatic job locking - prevents duplicate processing
  lockDuration: 30000, // 30 seconds
  
  // Stalledcheck interval
  stalledInterval: 30000,
  
  // Metrics collection
  metrics: {
    maxDataPoints: 100
  }
});

// Event listeners for observability
orderEventsWorker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed with result:`, result);
  // Send metrics to monitoring system
  metrics.increment('worker.completed', {
    queue: 'order.events',
    jobType: job.name
  });
});

orderEventsWorker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed with error:`, error);
  
  // Send alert if critical job failed
  if (job?.data.priority === 'critical') {
    alerting.sendAlert({
      severity: 'high',
      message: `Critical job ${job.id} failed: ${error.message}`
    });
  }
  
  // Send metrics
  metrics.increment('worker.failed', {
    queue: 'order.events',
    jobType: job?.name,
    error: error.message
  });
});

orderEventsWorker.on('stalled', (jobId) => {
  console.warn(`Job ${jobId} stalled`);
  metrics.increment('worker.stalled', {
    queue: 'order.events'
  });
});

orderEventsWorker.on('error', (error) => {
  console.error('Worker error:', error);
  metrics.increment('worker.error', {
    queue: 'order.events',
    error: error.message
  });
});

// Queue events for monitoring
const queueEvents = new QueueEvents('order.events', {
  connection: redisConnection
});

queueEvents.on('waiting', ({ jobId }) => {
  console.log(`Job ${jobId} is waiting`);
});

queueEvents.on('active', ({ jobId }) => {
  console.log(`Job ${jobId} is active`);
});

queueEvents.on('progress', ({ jobId, data }) => {
  console.log(`Job ${jobId} progress: ${data}%`);
});

// Graceful shutdown
async function gracefulShutdown() {
  console.log('Shutting down gracefully...');
  
  // Close worker (waits for active jobs to complete)
  await orderEventsWorker.close();
  
  // Close queue
  await orderEventsQueue.close();
  
  // Close queue events
  await queueEvents.close();
  
  // Close Redis connection
  await redisConnection.quit();
  
  console.log('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

### 5.4 Flow Jobs for Complex Workflows

**Use Case**: Order fulfillment workflow with dependent steps.

```typescript
import { FlowProducer } from 'bullmq';

const flowProducer = new FlowProducer({
  connection: redisConnection
});

// Create a complex workflow
async function createOrderFulfillmentFlow(orderId: string) {
  const flow = await flowProducer.add({
    name: 'order-fulfillment-flow',
    queueName: 'order.workflows',
    data: { orderId },
    children: [
      {
        name: 'validate-order',
        queueName: 'order.tasks',
        data: { orderId, step: 'validation' },
        children: [
          {
            name: 'check-inventory',
            queueName: 'inventory.tasks',
            data: { orderId }
          },
          {
            name: 'validate-payment',
            queueName: 'payment.tasks',
            data: { orderId }
          }
        ]
      },
      {
        name: 'process-payment',
        queueName: 'payment.tasks',
        data: { orderId, step: 'processing' },
        opts: {
          delay: 1000  // Wait 1 second after validation
        }
      },
      {
        name: 'prepare-shipment',
        queueName: 'shipping.tasks',
        data: { orderId },
        opts: {
          delay: 5000  // Wait 5 seconds after payment
        }
      }
    ]
  });
  
  return flow;
}

// Monitor flow progress
async function monitorFlow(flowId: string) {
  const tree = await flowProducer.getFlow({
    id: flowId,
    queueName: 'order.workflows'
  });
  
  console.log('Flow tree:', JSON.stringify(tree, null, 2));
}
```

### 5.5 Dead Letter Queue Management

```typescript
// Dead Letter Queue worker
const dlqWorker = new Worker('dead-letter-queue', async (job) => {
  console.error('Processing DLQ job:', {
    originalQueue: job.data.originalQueue,
    originalJobId: job.data.originalJobId,
    failureReason: job.data.failureReason,
    attempts: job.data.attempts,
    lastError: job.data.lastError
  });
  
  // Log to monitoring system
  await logger.error('Job moved to DLQ', {
    queue: job.data.originalQueue,
    jobId: job.data.originalJobId,
    error: job.data.lastError
  });
  
  // Send alert for critical jobs
  if (job.data.priority === 'critical') {
    await alerting.sendAlert({
      severity: 'critical',
      title: 'Critical job failed permanently',
      description: `Job ${job.data.originalJobId} from ${job.data.originalQueue} moved to DLQ`,
      metadata: job.data
    });
  }
  
  // Option: Attempt manual recovery or store for later analysis
  await saveToFailureDatabase(job.data);
}, {
  connection: redisConnection,
  concurrency: 1  // Process DLQ jobs sequentially
});

// Helper function to move failed jobs to DLQ
async function moveToDLQ(job: Job, error: Error) {
  const dlqQueue = new Queue('dead-letter-queue', {
    connection: redisConnection
  });
  
  await dlqQueue.add('dlq-entry', {
    originalQueue: job.queueName,
    originalJobId: job.id,
    originalJobData: job.data,
    failureReason: error.message,
    failureStack: error.stack,
    attempts: job.attemptsMade,
    lastError: error.toString(),
    failedAt: new Date().toISOString()
  }, {
    attempts: 1,  // Don't retry DLQ entries
    removeOnComplete: false,
    removeOnFail: false
  });
}

// Configure regular workers to use DLQ
const workerWithDLQ = new Worker('order.events', async (job) => {
  try {
    return await processJob(job);
  } catch (error) {
    // On final failure, move to DLQ
    if (job.attemptsMade >= job.opts.attempts) {
      await moveToDLQ(job, error as Error);
    }
    throw error;
  }
}, {
  connection: redisConnection
});
```

### 5.6 Priority Queues and Job Priorities

```typescript
// Add jobs with different priorities
const orderQueue = new Queue('order.events', {
  connection: redisConnection
});

// High priority - critical order
await orderQueue.add(
  'order.created',
  { orderId: '123', priority: 'critical' },
  {
    priority: 1  // Lower number = higher priority
  }
);

// Normal priority
await orderQueue.add(
  'order.created',
  { orderId: '124', priority: 'normal' },
  {
    priority: 5
  }
);

// Low priority - bulk operations
await orderQueue.add(
  'order.export',
  { reportType: 'monthly' },
  {
    priority: 10
  }
);

// Worker processes jobs by priority
const priorityWorker = new Worker('order.events', async (job) => {
  console.log(`Processing job with priority ${job.opts.priority}`);
  // Process job
}, {
  connection: redisConnection,
  concurrency: 5
});
```

### 5.7 Job Scheduling and Delayed Jobs

```typescript
// Schedule a job for future execution
const scheduledQueue = new Queue('scheduled.tasks', {
  connection: redisConnection
});

// Delay job by specific time (milliseconds)
await scheduledQueue.add(
  'order.reminder',
  { orderId: '123', type: 'payment_reminder' },
  {
    delay: 24 * 60 * 60 * 1000  // 24 hours
  }
);

// Schedule job for specific timestamp
const futureDate = new Date('2024-12-25T00:00:00Z');
await scheduledQueue.add(
  'holiday.promotion',
  { promoCode: 'XMAS2024' },
  {
    delay: futureDate.getTime() - Date.now()
  }
);

// Repeatable jobs (cron-like)
await scheduledQueue.add(
  'daily.report',
  { reportType: 'sales' },
  {
    repeat: {
      pattern: '0 0 * * *',  // Every day at midnight
      tz: 'America/Los_Angeles'
    }
  }
);

// Remove repeatable job
await scheduledQueue.removeRepeatable('daily.report', {
  pattern: '0 0 * * *',
  tz: 'America/Los_Angeles'
});
```

### 5.8 Monitoring and Observability

```typescript
import { QueueScheduler, QueueEvents, MetricsTime } from 'bullmq';

// Queue Scheduler - required for delayed and repeatable jobs
const queueScheduler = new QueueScheduler('order.events', {
  connection: redisConnection
});

// Metrics collection
const orderQueue = new Queue('order.events', {
  connection: redisConnection
});

// Get queue metrics
async function getQueueMetrics() {
  const [
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused
  ] = await Promise.all([
    orderQueue.getWaitingCount(),
    orderQueue.getActiveCount(),
    orderQueue.getCompletedCount(),
    orderQueue.getFailedCount(),
    orderQueue.getDelayedCount(),
    orderQueue.getPausedCount()
  ]);
  
  return {
    queue: 'order.events',
    counts: {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused
    },
    timestamp: new Date().toISOString()
  };
}

// Worker metrics
const orderWorker = new Worker('order.events', async (job) => {
  // Process job
}, {
  connection: redisConnection,
  metrics: {
    maxDataPoints: MetricsTime.ONE_WEEK
  }
});

// Get worker metrics
async function getWorkerMetrics() {
  const metrics = await orderWorker.getMetrics('completed', Date.now() - 3600000, Date.now());
  
  return {
    worker: 'order.events',
    metrics: {
      completed: metrics.count,
      avgDuration: metrics.data.reduce((a, b) => a + b, 0) / metrics.data.length
    }
  };
}

// Health check endpoint
async function healthCheck() {
  try {
    await redisConnection.ping();
    const metrics = await getQueueMetrics();
    
    return {
      status: 'healthy',
      redis: 'connected',
      queues: metrics
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

// Export metrics for Prometheus
async function prometheusMetrics() {
  const metrics = await getQueueMetrics();
  
  return `
# HELP bullmq_queue_waiting Number of waiting jobs
# TYPE bullmq_queue_waiting gauge
bullmq_queue_waiting{queue="order.events"} ${metrics.counts.waiting}

# HELP bullmq_queue_active Number of active jobs
# TYPE bullmq_queue_active gauge
bullmq_queue_active{queue="order.events"} ${metrics.counts.active}

# HELP bullmq_queue_completed Number of completed jobs
# TYPE bullmq_queue_completed counter
bullmq_queue_completed{queue="order.events"} ${metrics.counts.completed}

# HELP bullmq_queue_failed Number of failed jobs
# TYPE bullmq_queue_failed counter
bullmq_queue_failed{queue="order.events"} ${metrics.counts.failed}
  `.trim();
}
```

---

## 6. Inter-Service Communication Patterns

### 6.1 Communication Strategy Matrix

```mermaid
graph TB
    subgraph "Synchronous Communication - HTTP/REST"
        API[API Gateway] -->|Request-Response| Services[Business Services]
        Services -->|Direct Queries| Services
        
        Note1["Use Cases:<br/>- User queries<br/>- Real-time reads<br/>- Simple CRUD operations"]
    end
    
    subgraph "Asynchronous Communication - Events"
        Producer[Event Producer] -->|Publish| Queue[BullMQ Queue]
        Queue -->|Consume| Consumer[Event Consumer]
        
        Note2["Use Cases:<br/>- Domain events<br/>- Background processing<br/>- Cross-service workflows"]
    end
    
    subgraph "Decision Matrix"
        Decision{"Need immediate<br/>response?"}
        Decision -->|Yes| Sync[Use HTTP/REST]
        Decision -->|No| Async[Use Events/BullMQ]
        
        Async -->|Critical| HighPriority[High Priority Queue]
        Async -->|Non-Critical| LowPriority[Low Priority Queue]
    end
    
    style API fill:#4A90E2
    style Queue fill:#DC3545
    style Decision fill:#FFC107
```

**Decision Guidelines**:

| Scenario | Communication Pattern | Rationale |
|----------|----------------------|-----------|
| User fetching order details | Synchronous HTTP | Immediate response required |
| Sending order confirmation email | Asynchronous Event | Can be delayed, user doesn't wait |
| Checking product availability | Synchronous HTTP | Real-time data needed for decision |
| Updating inventory after order | Asynchronous Event | Eventual consistency acceptable |
| Processing payment | Synchronous HTTP (initially) + Event | Immediate validation, async notification |
| Generating monthly report | Asynchronous Event | Long-running, background task |

### 6.2 Synchronous Communication Pattern

```typescript
// Order Service making synchronous call to Product Service
import axios from 'axios';

class ProductServiceClient {
  private baseURL: string;
  private timeout: number = 5000;
  
  constructor() {
    this.baseURL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
  }
  
  async getProduct(productId: string): Promise<Product> {
    try {
      const response = await axios.get(
        `${this.baseURL}/api/products/${productId}`,
        {
          timeout: this.timeout,
          headers: {
            'X-Correlation-ID': getCorrelationId(),
            'X-Service-Name': 'order-service'
          }
        }
      );
      
      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new ServiceTimeoutError('Product service timeout');
        }
        if (error.response?.status === 404) {
          throw new ProductNotFoundError(productId);
        }
      }
      throw new ServiceCommunicationError('Failed to fetch product', error);
    }
  }
  
  async checkInventory(productId: string, quantity: number): Promise<boolean> {
    try {
      const response = await axios.post(
        `${this.baseURL}/api/products/${productId}/check-availability`,
        { quantity },
        {
          timeout: this.timeout,
          headers: {
            'X-Correlation-ID': getCorrelationId()
          }
        }
      );
      
      return response.data.data.available;
    } catch (error) {
      // Log error but don't fail the request
      console.error('Inventory check failed:', error);
      // Fallback: assume available and handle asynchronously
      return true;
    }
  }
}

// Usage in Order Service
const productClient = new ProductServiceClient();

async function validateOrderItems(items: OrderItem[]): Promise<void> {
  for (const item of items) {
    // Synchronous call to get product details
    const product = await productClient.getProduct(item.productId);
    
    if (!product) {
      throw new Error(`Product ${item.productId} not found`);
    }
    
    if (product.status !== 'active') {
      throw new Error(`Product ${item.productId} is not available`);
    }
    
    // Check inventory availability
    const available = await productClient.checkInventory(
      item.productId,
      item.quantity
    );
    
    if (!available) {
      throw new Error(`Insufficient inventory for product ${item.productId}`);
    }
  }
}
```

### 6.3 Asynchronous Event-Driven Pattern

```typescript
// Event Publisher (Order Service)
import { Queue } from 'bullmq';

class EventPublisher {
  private queues: Map<string, Queue>;
  
  constructor() {
    this.queues = new Map();
  }
  
  private getQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, {
        connection: redisConnection
      });
      this.queues.set(queueName, queue);
    }
    return this.queues.get(queueName)!;
  }
  
  async publishEvent<T>(
    queueName: string,
    event: DomainEvent<T>
  ): Promise<void> {
    const queue = this.getQueue(queueName);
    
    await queue.add(
      event.eventType,
      event,
      {
        jobId: event.eventId,  // Deduplicate by event ID
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    );
    
    console.log(`Published event ${event.eventType} to ${queueName}`);
  }
  
  async publishOrderEvent(event: DomainEvent<any>): Promise<void> {
    await this.publishEvent('order.events', event);
  }
  
  async publishInventoryEvent(event: DomainEvent<any>): Promise<void> {
    await this.publishEvent('inventory.events', event);
  }
}

// Usage: Publishing an event
const eventPublisher = new EventPublisher();

async function createOrder(orderData: CreateOrderDto): Promise<Order> {
  // Create order in database
  const order = await Order.create(orderData);
  
  // Publish event
  const event: DomainEvent<OrderCreatedData> = {
    eventId: uuid(),
    eventType: 'order.created',
    aggregateId: order._id.toString(),
    aggregateType: 'Order',
    occurredAt: new Date().toISOString(),
    version: 1,
    correlationId: getCorrelationId(),
    causationId: null,
    data: {
      orderNumber: order.orderNumber,
      userId: order.userId,
      items: order.items,
      total: order.pricing.total,
      shippingAddress: order.shippingAddress
    },
    metadata: {
      userId: order.userId,
      source: 'order-service',
      environment: process.env.NODE_ENV || 'development'
    }
  };
  
  await eventPublisher.publishOrderEvent(event);
  
  return order;
}
```

```typescript
// Event Consumer (Inventory Service)
import { Worker } from 'bullmq';

class OrderEventConsumer {
  private worker: Worker;
  
  constructor() {
    this.worker = new Worker('order.events', async (job) => {
      const event = job.data as DomainEvent<any>;
      
      // Route to appropriate handler
      switch (event.eventType) {
        case 'order.created':
          return await this.handleOrderCreated(event);
        case 'order.cancelled':
          return await this.handleOrderCancelled(event);
        default:
          console.log(`Ignoring event type: ${event.eventType}`);
          return { status: 'ignored' };
      }
    }, {
      connection: redisConnection,
      concurrency: 10
    });
    
    this.setupEventListeners();
  }
  
  private async handleOrderCreated(
    event: DomainEvent<OrderCreatedData>
  ): Promise<void> {
    const { orderId, items } = event.data;
    
    console.log(`Processing order.created event for order ${orderId}`);
    
    // Reserve inventory for each item
    for (const item of items) {
      await this.reserveInventory(item.productId, item.quantity, orderId);
    }
    
    // Publish inventory reserved event
    const inventoryEvent: DomainEvent<InventoryReservedData> = {
      eventId: uuid(),
      eventType: 'inventory.reserved',
      aggregateId: orderId,
      aggregateType: 'Inventory',
      occurredAt: new Date().toISOString(),
      version: 1,
      correlationId: event.correlationId,
      causationId: event.eventId,  // Link to parent event
      data: {
        orderId,
        items: items.map(item => ({
          productId: item.productId,
          quantity: item.quantity
        }))
      },
      metadata: {
        source: 'inventory-service',
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    await eventPublisher.publishInventoryEvent(inventoryEvent);
  }
  
  private async handleOrderCancelled(
    event: DomainEvent<OrderCancelledData>
  ): Promise<void> {
    const { orderId } = event.data;
    
    console.log(`Processing order.cancelled event for order ${orderId}`);
    
    // Release reserved inventory
    await this.releaseInventory(orderId);
    
    // Publish inventory released event
    const inventoryEvent: DomainEvent<InventoryReleasedData> = {
      eventId: uuid(),
      eventType: 'inventory.released',
      aggregateId: orderId,
      aggregateType: 'Inventory',
      occurredAt: new Date().toISOString(),
      version: 1,
      correlationId: event.correlationId,
      causationId: event.eventId,
      data: { orderId },
      metadata: {
        source: 'inventory-service',
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    await eventPublisher.publishInventoryEvent(inventoryEvent);
  }
  
  private async reserveInventory(
    productId: string,
    quantity: number,
    orderId: string
  ): Promise<void> {
    // Update product inventory
    const product = await Product.findById(productId);
    
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }
    
    if (product.inventory.available < quantity) {
      throw new Error(`Insufficient inventory for product ${productId}`);
    }
    
    // Atomically update inventory
    await Product.findByIdAndUpdate(productId, {
      $inc: {
        'inventory.available': -quantity,
        'inventory.reserved': quantity
      }
    });
    
    // Create inventory reservation record
    await InventoryReservation.create({
      productId,
      orderId,
      quantity,
      status: 'reserved',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)  // 15 minutes
    });
  }
  
  private async releaseInventory(orderId: string): Promise<void> {
    // Find all reservations for this order
    const reservations = await InventoryReservation.find({ orderId });
    
    for (const reservation of reservations) {
      // Return inventory to available pool
      await Product.findByIdAndUpdate(reservation.productId, {
        $inc: {
          'inventory.available': reservation.quantity,
          'inventory.reserved': -reservation.quantity
        }
      });
      
      // Mark reservation as released
      await InventoryReservation.findByIdAndUpdate(reservation._id, {
        status: 'released',
        releasedAt: new Date()
      });
    }
  }
  
  private setupEventListeners(): void {
    this.worker.on('completed', (job, result) => {
      console.log(`Job ${job.id} completed:`, result);
    });
    
    this.worker.on('failed', (job, error) => {
      console.error(`Job ${job?.id} failed:`, error);
    });
  }
}

// Initialize consumer
const orderEventConsumer = new OrderEventConsumer();
```

---

## 7. Data Architecture

### 7.1 Database-per-Service Pattern

```mermaid
graph TB
    subgraph "User Service Boundary"
        UserService[User Service]
        UserDB[(users_db<br/>MongoDB)]
        UserService --> UserDB
    end
    
    subgraph "Product Service Boundary"
        ProductService[Product Service]
        ProductDB[(products_db<br/>MongoDB)]
        ProductService --> ProductDB
    end
    
    subgraph "Order Service Boundary"
        OrderService[Order Service]
        OrderDB[(orders_db<br/>MongoDB)]
        OutboxDB[(outbox<br/>Collection)]
        OrderService --> OrderDB
        OrderService --> OutboxDB
    end
    
    subgraph "Cross-Service Data Access"
        UserService -.->|Events| EventBus[Event Bus]
        ProductService -.->|Events| EventBus
        OrderService -.->|Events| EventBus
        
        EventBus -.->|Subscribe| OrderService
        EventBus -.->|Subscribe| ProductService
    end
    
    Note["❌ NO DIRECT DATABASE ACCESS<br/>✅ ONLY VIA EVENTS OR APIS"]
    
    style UserDB fill:#17A2B8
    style ProductDB fill:#17A2B8
    style OrderDB fill:#17A2B8
    style EventBus fill:#DC3545
    style Note fill:#FFC107
```

**Key Principles**:
1. Each service has exclusive ownership of its database
2. No shared databases between services
3. Cross-service data access only via APIs or events
4. Each service can choose its own database technology (polyglot persistence)

### 7.2 Data Consistency Strategies

**Within Service Boundary (Strong Consistency)**:
```typescript
// Use database transactions for strong consistency within a service
async function updateUserProfile(userId: string, updates: Partial<User>): Promise<User> {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Update user
    const user = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, session }
    );
    
    // Update related data in same service
    await UserPreferences.updateOne(
      { userId },
      { lastModified: new Date() },
      { session }
    );
    
    await session.commitTransaction();
    return user;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

**Across Service Boundaries (Eventual Consistency)**:
```typescript
// Use events for eventual consistency across services
async function createOrder(orderData: CreateOrderDto): Promise<Order> {
  // 1. Create order (strong consistency within Order Service)
  const order = await Order.create(orderData);
  
  // 2. Publish event for other services (eventual consistency)
  await eventPublisher.publishOrderEvent({
    eventId: uuid(),
    eventType: 'order.created',
    aggregateId: order._id.toString(),
    aggregateType: 'Order',
    occurredAt: new Date().toISOString(),
    version: 1,
    correlationId: getCorrelationId(),
    causationId: null,
    data: { /* order data */ },
    metadata: { source: 'order-service' }
  });
  
  // Order is created immediately, inventory will be updated eventually
  return order;
}
```

### 7.3 Data Denormalization Strategy

**When to Denormalize**:
- Historical data that shouldn't change (order line items with prices)
- Frequently accessed data to avoid cross-service calls
- Read-heavy operations requiring performance

**Example: Order with Denormalized Product Data**:
```typescript
interface Order {
  _id: ObjectId;
  orderNumber: string;
  userId: ObjectId;
  
  // Denormalized product data (snapshot at order time)
  items: [{
    productId: ObjectId;        // Reference for updates
    productName: string;        // Denormalized
    productSku: string;         // Denormalized
    productImage: string;       // Denormalized
    unitPrice: number;          // Historical price
    quantity: number;
    totalPrice: number;
  }];
  
  // Denormalized user data (for display)
  customer: {
    userId: ObjectId;           // Reference
    name: string;               // Denormalized
    email: string;              // Denormalized
  };
  
  pricing: {
    subtotal: number;
    tax: number;
    shipping: number;
    total: number;
  };
  
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Keeping Denormalized Data in Sync**:
```typescript
// Subscribe to product updates and sync denormalized data
const productUpdateWorker = new Worker('product.events', async (job) => {
  const event = job.data as DomainEvent<ProductUpdatedData>;
  
  if (event.eventType === 'product.updated') {
    const { productId, name, image } = event.data;
    
    // Update denormalized data in all orders
    await Order.updateMany(
      { 'items.productId': productId },
      {
        $set: {
          'items.$[elem].productName': name,
          'items.$[elem].productImage': image
        }
      },
      {
        arrayFilters: [{ 'elem.productId': productId }]
      }
    );
    
    console.log(`Updated denormalized product data for product ${productId}`);
  }
}, {
  connection: redisConnection
});
```

---

## 8. API Contracts

### 8.1 Gateway Routes and Proxying

```typescript
// API Gateway routing configuration
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();

// Authentication middleware
app.use(authMiddleware);

// Correlation ID middleware
app.use((req, res, next) => {
  req.headers['x-correlation-id'] = req.headers['x-correlation-id'] || uuid();
  next();
});

// Route to User Service
app.use('/api/users', createProxyMiddleware({
  target: process.env.USER_SERVICE_URL || 'http://localhost:3001',
  changeOrigin: true,
  pathRewrite: { '^/api/users': '/api/users' },
  onProxyReq: (proxyReq, req) => {
    // Forward authentication token
    proxyReq.setHeader('X-User-ID', req.user?.id);
    proxyReq.setHeader('X-Correlation-ID', req.headers['x-correlation-id']);
  }
}));

// Route to Product Service
app.use('/api/products', createProxyMiddleware({
  target: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002',
  changeOrigin: true
}));

// Route to Order Service
app.use('/api/orders', createProxyMiddleware({
  target: process.env.ORDER_SERVICE_URL || 'http://localhost:3003',
  changeOrigin: true
}));

app.listen(3000, () => {
  console.log('API Gateway listening on port 3000');
});
```

### 8.2 Standard API Response Format

```typescript
// Success response
interface SuccessResponse<T> {
  success: true;
  data: T;
  metadata?: {
    page?: number;
    limit?: number;
    total?: number;
    correlationId?: string;
  };
  timestamp: string;
}

// Error response
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    stack?: string;  // Only in development
  };
  timestamp: string;
  correlationId?: string;
}

// Response helper
class ApiResponse {
  static success<T>(data: T, metadata?: any): SuccessResponse<T> {
    return {
      success: true,
      data,
      metadata,
      timestamp: new Date().toISOString()
    };
  }
  
  static error(
    code: string,
    message: string,
    details?: any
  ): ErrorResponse {
    return {
      success: false,
      error: {
        code,
        message,
        details
      },
      timestamp: new Date().toISOString()
    };
  }
}

// Usage in controllers
app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json(
        ApiResponse.error('ORDER_NOT_FOUND', 'Order not found')
      );
    }
    
    res.json(ApiResponse.success(order));
  } catch (error) {
    res.status(500).json(
      ApiResponse.error('INTERNAL_ERROR', 'Internal server error')
    );
  }
});
```

---

## 9. Deployment Strategy

### 9.1 Docker Compose Configuration

```yaml
version: '3.8'

services:
  # Infrastructure Services
  redis:
    image: redis:7-alpine
    container_name: ecommerce-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - ecommerce-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

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
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 3

  # Application Services
  api-gateway:
    build:
      context: ./api-gateway
      dockerfile: Dockerfile
    container_name: ecommerce-gateway
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - JWT_SECRET=${JWT_SECRET}
      - USER_SERVICE_URL=http://user-service:3001
      - PRODUCT_SERVICE_URL=http://product-service:3002
      - ORDER_SERVICE_URL=http://order-service:3003
    depends_on:
      user-service:
        condition: service_healthy
      product-service:
        condition: service_healthy
      order-service:
        condition: service_healthy
    networks:
      - ecommerce-network
    restart: unless-stopped

  user-service:
    build:
      context: ./user-service
      dockerfile: Dockerfile
    container_name: ecommerce-user-service
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=development
      - PORT=3001
      - MONGODB_URI=mongodb://admin:password@mongodb:27017/ecommerce_users?authSource=admin
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - ecommerce-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 3s
      retries: 3

  product-service:
    build:
      context: ./product-service
      dockerfile: Dockerfile
    container_name: ecommerce-product-service
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=development
      - PORT=3002
      - MONGODB_URI=mongodb://admin:password@mongodb:27017/ecommerce_products?authSource=admin
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - ecommerce-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
      interval: 30s
      timeout: 3s
      retries: 3

  order-service:
    build:
      context: ./order-service
      dockerfile: Dockerfile
    container_name: ecommerce-order-service
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=development
      - PORT=3003
      - MONGODB_URI=mongodb://admin:password@mongodb:27017/ecommerce_orders?authSource=admin
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - PRODUCT_SERVICE_URL=http://product-service:3002
      - USER_SERVICE_URL=http://user-service:3001
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - ecommerce-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3003/health"]
      interval: 30s
      timeout: 3s
      retries: 3

  inventory-service:
    build:
      context: ./inventory-service
      dockerfile: Dockerfile
    container_name: ecommerce-inventory-service
    ports:
      - "3005:3005"
    environment:
      - NODE_ENV=development
      - PORT=3005
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - PRODUCT_SERVICE_URL=http://product-service:3002
    depends_on:
      redis:
        condition: service_healthy
      order-service:
        condition: service_healthy
    networks:
      - ecommerce-network
    restart: unless-stopped
    deploy:
      replicas: 2  # Multiple workers for scalability

  notification-service:
    build:
      context: ./notification-service
      dockerfile: Dockerfile
    container_name: ecommerce-notification-service
    ports:
      - "3004:3004"
    environment:
      - NODE_ENV=development
      - PORT=3004
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - ecommerce-network
    restart: unless-stopped
    deploy:
      replicas: 3  # Multiple workers for email sending

  email-service:
    build:
      context: ./email-service
      dockerfile: Dockerfile
    container_name: ecommerce-email-service
    ports:
      - "3006:3006"
    environment:
      - NODE_ENV=development
      - PORT=3006
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - SENDGRID_API_KEY=${SENDGRID_API_KEY}
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - ecommerce-network
    restart: unless-stopped

volumes:
  mongodb_data:
  redis_data:

networks:
  ecommerce-network:
    driver: bridge
```

### 9.2 Environment Variables

```.env
# API Gateway
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
JWT_EXPIRATION=24h

# Service Discovery
USER_SERVICE_URL=http://localhost:3001
PRODUCT_SERVICE_URL=http://localhost:3002
ORDER_SERVICE_URL=http://localhost:3003
NOTIFICATION_SERVICE_URL=http://localhost:3004
INVENTORY_SERVICE_URL=http://localhost:3005

# MongoDB
MONGODB_URI=mongodb://admin:password@localhost:27017/ecommerce?authSource=admin

# Redis / BullMQ
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Email Configuration
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your-mailtrap-username
SMTP_PASS=your-mailtrap-password
SMTP_SECURE=false
FROM_EMAIL=noreply@ecommerce.local

# SendGrid (Production)
SENDGRID_API_KEY=your-sendgrid-api-key

# Node Environment
NODE_ENV=development
```

---

## 10. Implementation Guidelines

### 10.1 Project Structure

```
ecommerce-microservices/
├── api-gateway/
│   ├── src/
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── correlationId.ts
│   │   │   ├── errorHandler.ts
│   │   │   └── rateLimit.ts
│   │   ├── routes/
│   │   │   └── index.ts
│   │   ├── config/
│   │   │   └── services.ts
│   │   └── server.ts
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── user-service/
│   ├── src/
│   │   ├── models/
│   │   │   └── User.ts
│   │   ├── controllers/
│   │   │   └── userController.ts
│   │   ├── routes/
│   │   │   └── userRoutes.ts
│   │   ├── services/
│   │   │   └── authService.ts
│   │   ├── events/
│   │   │   ├── publisher.ts
│   │   │   └── consumer.ts
│   │   ├── middleware/
│   │   └── server.ts
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── product-service/
│   ├── src/
│   │   ├── models/
│   │   │   └── Product.ts
│   │   ├── controllers/
│   │   │   └── productController.ts
│   │   ├── routes/
│   │   │   └── productRoutes.ts
│   │   ├── events/
│   │   │   ├── publisher.ts
│   │   │   └── consumer.ts
│   │   └── server.ts
│   ├── Dockerfile
│   └── package.json
│
├── order-service/
│   ├── src/
│   │   ├── models/
│   │   │   ├── Order.ts
│   │   │   └── Outbox.ts
│   │   ├── controllers/
│   │   │   └── orderController.ts
│   │   ├── routes/
│   │   │   └── orderRoutes.ts
│   │   ├── saga/
│   │   │   ├── orderSaga.ts
│   │   │   └── sagaOrchestrator.ts
│   │   ├── events/
│   │   │   ├── publisher.ts
│   │   │   ├── consumer.ts
│   │   │   └── outboxPublisher.ts
│   │   ├── services/
│   │   │   ├── productClient.ts
│   │   │   └── userClient.ts
│   │   └── server.ts
│   ├── Dockerfile
│   └── package.json
│
├── inventory-service/
│   ├── src/
│   │   ├── workers/
│   │   │   ├── orderEventWorker.ts
│   │   │   └── inventoryWorker.ts
│   │   ├── services/
│   │   │   └── inventoryService.ts
│   │   ├── events/
│   │   │   └── publisher.ts
│   │   └── server.ts
│   ├── Dockerfile
│   └── package.json
│
├── notification-service/
│   ├── src/
│   │   ├── workers/
│   │   │   └── notificationWorker.ts
│   │   ├── services/
│   │   │   ├── emailService.ts
│   │   │   ├── smsService.ts
│   │   │   └── templateService.ts
│   │   ├── templates/
│   │   │   ├── orderConfirmation.hbs
│   │   │   ├── orderShipped.hbs
│   │   │   └── welcomeEmail.hbs
│   │   └── server.ts
│   ├── Dockerfile
│   └── package.json
│
├── email-service/
│   ├── src/
│   │   ├── workers/
│   │   │   └── emailWorker.ts
│   │   ├── services/
│   │   │   └── sendgridService.ts
│   │   └── server.ts
│   ├── Dockerfile
│   └── package.json
│
├── shared/
│   ├── types/
│   │   ├── events.ts
│   │   ├── api.ts
│   │   └── models.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── correlationId.ts
│   │   └── errorHandler.ts
│   └── package.json
│
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── ARCHITECTURE.md
```

### 10.2 Development Workflow

```bash
# 1. Clone and setup
git clone <repository>
cd ecommerce-microservices

# 2. Install dependencies for all services
npm install  # Root package.json can run all services

# 3. Start infrastructure
docker-compose up -d redis mongodb

# 4. Start services in development mode
# Terminal 1 - API Gateway
cd api-gateway && bun run dev

# Terminal 2 - User Service
cd user-service && bun run dev

# Terminal 3 - Product Service
cd product-service && bun run dev

# Terminal 4 - Order Service
cd order-service && bun run dev

# Terminal 5 - Inventory Service (Worker)
cd inventory-service && bun run dev

# Terminal 6 - Notification Service (Worker)
cd notification-service && bun run dev

# OR use Docker Compose to start everything
docker-compose up --build
```

### 10.3 Key Dependencies

**Common Dependencies (all services)**:
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "ioredis": "^5.3.2",
    "bullmq": "^5.0.0",
    "mongoose": "^8.0.0",
    "dotenv": "^16.3.1",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "@types/uuid": "^9.0.7",
    "bun-types": "^1.0.0",
    "typescript": "^5.3.0"
  }
}
```

**API Gateway Specific**:
```json
{
  "dependencies": {
    "http-proxy-middleware": "^2.0.6",
    "jsonwebtoken": "^9.0.2",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "cors": "^2.8.5"
  }
}
```

**Notification/Email Service Specific**:
```json
{
  "dependencies": {
    "nodemailer": "^6.9.7",
    "@sendgrid/mail": "^8.1.0",
    "handlebars": "^4.7.8",
    "twilio": "^4.19.0"
  }
}
```

---

## Conclusion

This specification outlines a production-ready, event-driven microservices architecture leveraging BullMQ for reliable asynchronous communication. The architecture implements industry best practices including:

✅ **Event-Driven Architecture** - Loose coupling via domain events
✅ **Transactional Outbox Pattern** - Reliable event publishing
✅ **Saga Pattern** - Distributed transaction management
✅ **Idempotent Consumers** - Safe event reprocessing
✅ **Dead Letter Queues** - Failure handling and recovery
✅ **Priority Queues** - Critical operation handling
✅ **Worker Scaling** - Independent horizontal scaling
✅ **Monitoring & Observability** - Comprehensive metrics and logging

The architecture balances educational clarity with production-grade patterns, providing a solid foundation for understanding microservices while remaining extensible for advanced features like service mesh integration, CQRS, and event sourcing.

**Next Steps**:
1. Implement core services with BullMQ producers and consumers
2. Add comprehensive testing (unit, integration, E2E)
3. Implement monitoring with Prometheus and Grafana
4. Add distributed tracing with OpenTelemetry
5. Implement circuit breakers and retry policies
6. Add API documentation with OpenAPI/Swagger
7. Implement security best practices (API keys, OAuth2)
8. Set up CI/CD pipeline with automated deployments