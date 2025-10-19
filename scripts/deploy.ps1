# Deployment Script for Ecommerce Microservices (PowerShell)
# This script handles deployment to different environments

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("staging", "production")]
    [string]$Environment,
    
    [string]$Services = "api-gateway,user-service,product-service,order-service,inventory-service,email-service,notification-service",
    
    [switch]$SkipTests,
    
    [switch]$DryRun,
    
    [switch]$Help
)

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Blue"

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Red
}

# Function to show usage
function Show-Usage {
    Write-Host "Usage: .\deploy.ps1 [PARAMETERS]"
    Write-Host ""
    Write-Host "Parameters:"
    Write-Host "  -Environment ENV     Environment to deploy to (staging, production)"
    Write-Host "  -Services SERVICES   Comma-separated list of services to deploy"
    Write-Host "  -SkipTests           Skip running tests"
    Write-Host "  -DryRun              Show what would be deployed without actually deploying"
    Write-Host "  -Help                Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\deploy.ps1 -Environment staging"
    Write-Host "  .\deploy.ps1 -Environment production -Services api-gateway,user-service"
    Write-Host "  .\deploy.ps1 -Environment staging -SkipTests -DryRun"
}

# Show help if requested
if ($Help) {
    Show-Usage
    exit 0
}

Write-Status "Starting deployment to $Environment environment"
Write-Status "Services to deploy: $Services"
Write-Status "Skip tests: $SkipTests"
Write-Status "Dry run: $DryRun"

# Function to check prerequisites
function Test-Prerequisites {
    Write-Status "Checking prerequisites..."
    
    # Check if Docker is installed
    try {
        docker --version | Out-Null
    }
    catch {
        Write-Error "Docker is not installed"
        exit 1
    }
    
    # Check if Docker Compose is installed
    try {
        docker-compose --version | Out-Null
    }
    catch {
        Write-Error "Docker Compose is not installed"
        exit 1
    }
    
    # Check if environment file exists
    if (-not (Test-Path ".env.$Environment")) {
        Write-Error "Environment file .env.$Environment not found"
        exit 1
    }
    
    Write-Success "Prerequisites check passed"
}

# Function to run tests
function Invoke-Tests {
    if ($SkipTests) {
        Write-Warning "Skipping tests as requested"
        return
    }
    
    Write-Status "Running tests..."
    
    if ($DryRun) {
        Write-Status "DRY RUN: Would run tests for services: $Services"
        return
    }
    
    # Install dependencies
    bun install --frozen-lockfile
    
    # Run tests for each service
    $ServiceArray = $Services -split ","
    foreach ($service in $ServiceArray) {
        Write-Status "Testing $service..."
        Push-Location "apps\$service"
        if ((Test-Path "package.json") -and (Select-String -Path "package.json" -Pattern '"test"' -Quiet)) {
            bun test
        }
        else {
            Write-Warning "No tests configured for $service"
        }
        Pop-Location
    }
    
    Write-Success "All tests passed"
}

# Function to build Docker images
function Build-Images {
    Write-Status "Building Docker images..."
    
    if ($DryRun) {
        Write-Status "DRY RUN: Would build images for services: $Services"
        return
    }
    
    # Build images for each service
    $ServiceArray = $Services -split ","
    foreach ($service in $ServiceArray) {
        Write-Status "Building $service image..."
        docker build -t "$service`:latest" -f "apps\$service\Dockerfile" .
    }
    
    Write-Success "All images built successfully"
}

# Function to deploy services
function Deploy-Services {
    Write-Status "Deploying services..."
    
    if ($DryRun) {
        Write-Status "DRY RUN: Would deploy services: $Services"
        Write-Status "DRY RUN: Would use docker-compose.$Environment.yml"
        return
    }
    
    # Load environment variables
    Get-Content ".env.$Environment" | Where-Object { $_ -notmatch '^#' -and $_ -ne '' } | ForEach-Object {
        $key, $value = $_ -split '=', 2
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
    
    # Deploy using appropriate docker-compose file
    if ($Environment -eq "production") {
        docker-compose -f docker-compose.prod.yml up -d
    }
    else {
        docker-compose -f docker-compose.yml up -d
    }
    
    Write-Success "Services deployed successfully"
}

# Function to run health checks
function Test-HealthChecks {
    Write-Status "Running health checks..."
    
    if ($DryRun) {
        Write-Status "DRY RUN: Would run health checks for services: $Services"
        return
    }
    
    # Wait for services to start
    Start-Sleep -Seconds 30
    
    # Check health of each service
    $ServiceArray = $Services -split ","
    foreach ($service in $ServiceArray) {
        Write-Status "Checking health of $service..."
        
        # Map service names to ports
        $port = switch ($service) {
            "api-gateway" { 3000; break }
            "user-service" { 3001; break }
            "product-service" { 3002; break }
            "order-service" { 3003; break }
            "notification-service" { 3004; break }
            "inventory-service" { 3005; break }
            "email-service" { 3006; break }
            default { 
                Write-Warning "Unknown service: $service"
                continue
            }
        }
        
        # Check health endpoint
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$port/health" -Method GET -TimeoutSec 10
            if ($response.StatusCode -eq 200) {
                Write-Success "$service is healthy"
            }
            else {
                Write-Error "$service health check failed"
                exit 1
            }
        }
        catch {
            Write-Error "$service health check failed: $($_.Exception.Message)"
            exit 1
        }
    }
    
    Write-Success "All health checks passed"
}

# Function to cleanup
function Invoke-Cleanup {
    Write-Status "Cleaning up..."
    
    if ($DryRun) {
        Write-Status "DRY RUN: Would clean up old images and containers"
        return
    }
    
    # Remove unused images
    docker image prune -f
    
    Write-Success "Cleanup completed"
}

# Main deployment flow
function Start-Deployment {
    Write-Status "Starting deployment process..."
    
    Test-Prerequisites
    Invoke-Tests
    Build-Images
    Deploy-Services
    Test-HealthChecks
    Invoke-Cleanup
    
    Write-Success "Deployment to $Environment completed successfully!"
    Write-Status "Services deployed: $Services"
}

# Run main function
Start-Deployment
