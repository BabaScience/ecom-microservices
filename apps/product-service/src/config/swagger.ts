import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Product Service API',
      version: '1.0.0',
      description: 'API documentation for the Product Service microservice',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PRODUCT_SERVICE_PORT || 3002}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Product: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Product ID',
            },
            name: {
              type: 'string',
              description: 'Product name',
            },
            description: {
              type: 'string',
              description: 'Product description',
            },
            sku: {
              type: 'string',
              description: 'Product SKU',
            },
            price: {
              type: 'number',
              description: 'Product price',
            },
            currency: {
              type: 'string',
              enum: ['USD', 'EUR', 'GBP'],
              description: 'Currency',
            },
            inventory: {
              type: 'object',
              properties: {
                quantity: {
                  type: 'number',
                  description: 'Total quantity',
                },
                reserved: {
                  type: 'number',
                  description: 'Reserved quantity',
                },
                available: {
                  type: 'number',
                  description: 'Available quantity',
                },
              },
            },
            category: {
              type: 'string',
              description: 'Product category',
            },
            images: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Product images',
            },
            specifications: {
              type: 'object',
              description: 'Product specifications',
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'discontinued'],
              description: 'Product status',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        CreateProductRequest: {
          type: 'object',
          required: ['name', 'description', 'sku', 'price', 'category'],
          properties: {
            name: {
              type: 'string',
            },
            description: {
              type: 'string',
            },
            sku: {
              type: 'string',
            },
            price: {
              type: 'number',
              minimum: 0,
            },
            currency: {
              type: 'string',
              enum: ['USD', 'EUR', 'GBP'],
              default: 'USD',
            },
            inventory: {
              type: 'object',
              properties: {
                quantity: {
                  type: 'number',
                  minimum: 0,
                  default: 0,
                },
              },
            },
            category: {
              type: 'string',
            },
            images: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            specifications: {
              type: 'object',
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'discontinued'],
              default: 'active',
            },
          },
        },
        UpdateProductRequest: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
            },
            description: {
              type: 'string',
            },
            price: {
              type: 'number',
              minimum: 0,
            },
            currency: {
              type: 'string',
              enum: ['USD', 'EUR', 'GBP'],
            },
            category: {
              type: 'string',
            },
            images: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            specifications: {
              type: 'object',
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'discontinued'],
            },
          },
        },
        InventoryRequest: {
          type: 'object',
          required: ['quantity'],
          properties: {
            quantity: {
              type: 'number',
              minimum: 0,
            },
          },
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
            },
            data: {
              type: 'object',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                },
                message: {
                  type: 'string',
                },
                details: {
                  type: 'object',
                },
              },
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

const specs = swaggerJsdoc(options);

export { specs, swaggerUi };

