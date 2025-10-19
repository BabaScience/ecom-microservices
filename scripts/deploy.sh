#!/bin/bash

# Deployment Script for Ecommerce Microservices
# This script handles deployment to different environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=""
SERVICES=""
SKIP_TESTS=false
DRY_RUN=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Environment to deploy to (staging, production)"
    echo "  -s, --services SERVICES  Comma-separated list of services to deploy"
    echo "  --skip-tests            Skip running tests"
    echo "  --dry-run               Show what would be deployed without actually deploying"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e staging"
    echo "  $0 -e production -s api-gateway,user-service"
    echo "  $0 -e staging --skip-tests --dry-run"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -s|--services)
            SERVICES="$2"
            shift 2
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$ENVIRONMENT" ]]; then
    print_error "Environment is required"
    show_usage
    exit 1
fi

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    print_error "Environment must be 'staging' or 'production'"
    exit 1
fi

# Set default services if not specified
if [[ -z "$SERVICES" ]]; then
    SERVICES="api-gateway,user-service,product-service,order-service,inventory-service,email-service,notification-service"
fi

print_status "Starting deployment to $ENVIRONMENT environment"
print_status "Services to deploy: $SERVICES"
print_status "Skip tests: $SKIP_TESTS"
print_status "Dry run: $DRY_RUN"

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if environment file exists
    if [[ ! -f ".env.$ENVIRONMENT" ]]; then
        print_error "Environment file .env.$ENVIRONMENT not found"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Function to run tests
run_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        print_warning "Skipping tests as requested"
        return 0
    fi
    
    print_status "Running tests..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "DRY RUN: Would run tests for services: $SERVICES"
        return 0
    fi
    
    # Install dependencies
    bun install --frozen-lockfile
    
    # Run tests for each service
    IFS=',' read -ra SERVICE_ARRAY <<< "$SERVICES"
    for service in "${SERVICE_ARRAY[@]}"; do
        print_status "Testing $service..."
        cd "apps/$service"
        if [[ -f "package.json" ]] && grep -q '"test"' package.json; then
            bun test
        else
            print_warning "No tests configured for $service"
        fi
        cd - > /dev/null
    done
    
    print_success "All tests passed"
}

# Function to build Docker images
build_images() {
    print_status "Building Docker images..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "DRY RUN: Would build images for services: $SERVICES"
        return 0
    fi
    
    # Build images for each service
    IFS=',' read -ra SERVICE_ARRAY <<< "$SERVICES"
    for service in "${SERVICE_ARRAY[@]}"; do
        print_status "Building $service image..."
        docker build -t "$service:latest" -f "apps/$service/Dockerfile" .
    done
    
    print_success "All images built successfully"
}

# Function to deploy services
deploy_services() {
    print_status "Deploying services..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "DRY RUN: Would deploy services: $SERVICES"
        print_status "DRY RUN: Would use docker-compose.$ENVIRONMENT.yml"
        return 0
    fi
    
    # Load environment variables
    export $(cat ".env.$ENVIRONMENT" | grep -v '^#' | xargs)
    
    # Deploy using appropriate docker-compose file
    if [[ "$ENVIRONMENT" == "production" ]]; then
        docker-compose -f docker-compose.prod.yml up -d
    else
        docker-compose -f docker-compose.yml up -d
    fi
    
    print_success "Services deployed successfully"
}

# Function to run health checks
run_health_checks() {
    print_status "Running health checks..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "DRY RUN: Would run health checks for services: $SERVICES"
        return 0
    fi
    
    # Wait for services to start
    sleep 30
    
    # Check health of each service
    IFS=',' read -ra SERVICE_ARRAY <<< "$SERVICES"
    for service in "${SERVICE_ARRAY[@]}"; do
        print_status "Checking health of $service..."
        
        # Map service names to ports
        case $service in
            api-gateway)
                port=3000
                ;;
            user-service)
                port=3001
                ;;
            product-service)
                port=3002
                ;;
            order-service)
                port=3003
                ;;
            notification-service)
                port=3004
                ;;
            inventory-service)
                port=3005
                ;;
            email-service)
                port=3006
                ;;
            *)
                print_warning "Unknown service: $service"
                continue
                ;;
        esac
        
        # Check health endpoint
        if curl -f "http://localhost:$port/health" > /dev/null 2>&1; then
            print_success "$service is healthy"
        else
            print_error "$service health check failed"
            exit 1
        fi
    done
    
    print_success "All health checks passed"
}

# Function to cleanup
cleanup() {
    print_status "Cleaning up..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "DRY RUN: Would clean up old images and containers"
        return 0
    fi
    
    # Remove unused images
    docker image prune -f
    
    print_success "Cleanup completed"
}

# Main deployment flow
main() {
    print_status "Starting deployment process..."
    
    check_prerequisites
    run_tests
    build_images
    deploy_services
    run_health_checks
    cleanup
    
    print_success "Deployment to $ENVIRONMENT completed successfully!"
    print_status "Services deployed: $SERVICES"
}

# Run main function
main
