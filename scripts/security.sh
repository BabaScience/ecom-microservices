#!/bin/bash

# Security and Dependency Update Script
# This script helps manage security vulnerabilities and dependency updates

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
    echo "  --audit              Run security audit"
    echo "  --update             Update all dependencies"
    echo "  --update-latest      Update to latest versions (including breaking changes)"
    echo "  --fix-vulnerabilities  Fix known vulnerabilities"
    echo "  --check-outdated     Check for outdated packages"
    echo "  --clean              Clean node_modules and reinstall"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --audit"
    echo "  $0 --update"
    echo "  $0 --fix-vulnerabilities"
}

# Function to run security audit
run_audit() {
    print_status "Running security audit..."
    
    if bun audit; then
        print_success "No security vulnerabilities found!"
    else
        print_warning "Security vulnerabilities found. Run --fix-vulnerabilities to attempt fixes."
        return 1
    fi
}

# Function to update dependencies
update_dependencies() {
    print_status "Updating dependencies..."
    
    # Update root dependencies
    print_status "Updating root dependencies..."
    bun update
    
    # Update dependencies for each service
    for service in apps/*/; do
        if [[ -f "$service/package.json" ]]; then
            print_status "Updating dependencies for $(basename "$service")..."
            cd "$service"
            bun update
            cd - > /dev/null
        fi
    done
    
    # Update shared package dependencies
    if [[ -f "packages/shared/package.json" ]]; then
        print_status "Updating shared package dependencies..."
        cd packages/shared
        bun update
        cd - > /dev/null
    fi
    
    print_success "Dependencies updated successfully!"
}

# Function to update to latest versions
update_latest() {
    print_status "Updating to latest versions (including breaking changes)..."
    
    # Update root dependencies
    print_status "Updating root dependencies to latest..."
    bun update --latest
    
    # Update dependencies for each service
    for service in apps/*/; do
        if [[ -f "$service/package.json" ]]; then
            print_status "Updating $(basename "$service") to latest versions..."
            cd "$service"
            bun update --latest
            cd - > /dev/null
        fi
    done
    
    # Update shared package dependencies
    if [[ -f "packages/shared/package.json" ]]; then
        print_status "Updating shared package to latest versions..."
        cd packages/shared
        bun update --latest
        cd - > /dev/null
    fi
    
    print_success "Dependencies updated to latest versions!"
}

# Function to fix known vulnerabilities
fix_vulnerabilities() {
    print_status "Attempting to fix known vulnerabilities..."
    
    # First, run audit to see what vulnerabilities exist
    print_status "Checking current vulnerabilities..."
    bun audit || true
    
    # Try to update vulnerable packages
    print_status "Updating vulnerable packages..."
    
    # Update swagger-jsdoc and swagger-ui-express to latest versions
    for service in apps/*/; do
        if [[ -f "$service/package.json" ]] && grep -q "swagger-jsdoc" "$service/package.json"; then
            print_status "Updating Swagger packages in $(basename "$service")..."
            cd "$service"
            
            # Update to latest versions
            bun add swagger-jsdoc@latest swagger-ui-express@latest
            
            cd - > /dev/null
        fi
    done
    
    # Update validator if it's a direct dependency
    for service in apps/*/; do
        if [[ -f "$service/package.json" ]] && grep -q '"validator"' "$service/package.json"; then
            print_status "Updating validator in $(basename "$service")..."
            cd "$service"
            bun add validator@latest
            cd - > /dev/null
        fi
    done
    
    # Run audit again to check if vulnerabilities are fixed
    print_status "Re-running security audit..."
    if bun audit; then
        print_success "All vulnerabilities fixed!"
    else
        print_warning "Some vulnerabilities may still exist. Manual review required."
    fi
}

# Function to check for outdated packages
check_outdated() {
    print_status "Checking for outdated packages..."
    
    # Check root dependencies
    print_status "Root dependencies:"
    bun outdated || echo "No outdated packages in root"
    
    # Check each service
    for service in apps/*/; do
        if [[ -f "$service/package.json" ]]; then
            print_status "Outdated packages in $(basename "$service"):"
            cd "$service"
            bun outdated || echo "No outdated packages in $(basename "$service")"
            cd - > /dev/null
        fi
    done
    
    # Check shared package
    if [[ -f "packages/shared/package.json" ]]; then
        print_status "Outdated packages in shared:"
        cd packages/shared
        bun outdated || echo "No outdated packages in shared"
        cd - > /dev/null
    fi
}

# Function to clean and reinstall
clean_install() {
    print_status "Cleaning and reinstalling dependencies..."
    
    # Remove node_modules and lock files
    print_status "Removing node_modules and lock files..."
    rm -rf node_modules bun.lockb
    
    # Remove service node_modules
    for service in apps/*/; do
        if [[ -d "$service/node_modules" ]]; then
            rm -rf "$service/node_modules"
        fi
    done
    
    # Remove shared package node_modules
    if [[ -d "packages/shared/node_modules" ]]; then
        rm -rf packages/shared/node_modules
    fi
    
    # Reinstall dependencies
    print_status "Reinstalling dependencies..."
    bun install
    
    print_success "Clean installation completed!"
}

# Parse command line arguments
if [[ $# -eq 0 ]]; then
    show_usage
    exit 0
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        --audit)
            run_audit
            shift
            ;;
        --update)
            update_dependencies
            shift
            ;;
        --update-latest)
            update_latest
            shift
            ;;
        --fix-vulnerabilities)
            fix_vulnerabilities
            shift
            ;;
        --check-outdated)
            check_outdated
            shift
            ;;
        --clean)
            clean_install
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

print_success "Security and dependency management completed!"
