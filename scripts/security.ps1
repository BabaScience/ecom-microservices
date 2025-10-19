# Security and Dependency Update Script (PowerShell)
# This script helps manage security vulnerabilities and dependency updates

param(
    [switch]$Audit,
    [switch]$Update,
    [switch]$UpdateLatest,
    [switch]$FixVulnerabilities,
    [switch]$CheckOutdated,
    [switch]$Clean,
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
    Write-Host "Usage: .\security.ps1 [PARAMETERS]"
    Write-Host ""
    Write-Host "Parameters:"
    Write-Host "  -Audit              Run security audit"
    Write-Host "  -Update              Update all dependencies"
    Write-Host "  -UpdateLatest        Update to latest versions (including breaking changes)"
    Write-Host "  -FixVulnerabilities  Fix known vulnerabilities"
    Write-Host "  -CheckOutdated       Check for outdated packages"
    Write-Host "  -Clean               Clean node_modules and reinstall"
    Write-Host "  -Help                Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\security.ps1 -Audit"
    Write-Host "  .\security.ps1 -Update"
    Write-Host "  .\security.ps1 -FixVulnerabilities"
}

# Function to run security audit
function Invoke-Audit {
    Write-Status "Running security audit..."
    
    try {
        bun audit
        Write-Success "No security vulnerabilities found!"
    }
    catch {
        Write-Warning "Security vulnerabilities found. Run -FixVulnerabilities to attempt fixes."
        return $false
    }
    return $true
}

# Function to update dependencies
function Update-Dependencies {
    Write-Status "Updating dependencies..."
    
    # Update root dependencies
    Write-Status "Updating root dependencies..."
    bun update
    
    # Update dependencies for each service
    Get-ChildItem -Path "apps" -Directory | ForEach-Object {
        if (Test-Path "$($_.FullName)\package.json") {
            Write-Status "Updating dependencies for $($_.Name)..."
            Push-Location $_.FullName
            bun update
            Pop-Location
        }
    }
    
    # Update shared package dependencies
    if (Test-Path "packages\shared\package.json") {
        Write-Status "Updating shared package dependencies..."
        Push-Location "packages\shared"
        bun update
        Pop-Location
    }
    
    Write-Success "Dependencies updated successfully!"
}

# Function to update to latest versions
function Update-Latest {
    Write-Status "Updating to latest versions (including breaking changes)..."
    
    # Update root dependencies
    Write-Status "Updating root dependencies to latest..."
    bun update --latest
    
    # Update dependencies for each service
    Get-ChildItem -Path "apps" -Directory | ForEach-Object {
        if (Test-Path "$($_.FullName)\package.json") {
            Write-Status "Updating $($_.Name) to latest versions..."
            Push-Location $_.FullName
            bun update --latest
            Pop-Location
        }
    }
    
    # Update shared package dependencies
    if (Test-Path "packages\shared\package.json") {
        Write-Status "Updating shared package to latest versions..."
        Push-Location "packages\shared"
        bun update --latest
        Pop-Location
    }
    
    Write-Success "Dependencies updated to latest versions!"
}

# Function to fix known vulnerabilities
function Fix-Vulnerabilities {
    Write-Status "Attempting to fix known vulnerabilities..."
    
    # First, run audit to see what vulnerabilities exist
    Write-Status "Checking current vulnerabilities..."
    try {
        bun audit
    }
    catch {
        Write-Warning "Vulnerabilities found, attempting to fix..."
    }
    
    # Try to update vulnerable packages
    Write-Status "Updating vulnerable packages..."
    
    # Update swagger-jsdoc and swagger-ui-express to latest versions
    Get-ChildItem -Path "apps" -Directory | ForEach-Object {
        if ((Test-Path "$($_.FullName)\package.json") -and (Select-String -Path "$($_.FullName)\package.json" -Pattern "swagger-jsdoc" -Quiet)) {
            Write-Status "Updating Swagger packages in $($_.Name)..."
            Push-Location $_.FullName
            
            # Update to latest versions
            bun add swagger-jsdoc@latest swagger-ui-express@latest
            
            Pop-Location
        }
    }
    
    # Update validator if it's a direct dependency
    Get-ChildItem -Path "apps" -Directory | ForEach-Object {
        if ((Test-Path "$($_.FullName)\package.json") -and (Select-String -Path "$($_.FullName)\package.json" -Pattern '"validator"' -Quiet)) {
            Write-Status "Updating validator in $($_.Name)..."
            Push-Location $_.FullName
            bun add validator@latest
            Pop-Location
        }
    }
    
    # Run audit again to check if vulnerabilities are fixed
    Write-Status "Re-running security audit..."
    try {
        bun audit
        Write-Success "All vulnerabilities fixed!"
    }
    catch {
        Write-Warning "Some vulnerabilities may still exist. Manual review required."
    }
}

# Function to check for outdated packages
function Test-Outdated {
    Write-Status "Checking for outdated packages..."
    
    # Check root dependencies
    Write-Status "Root dependencies:"
    try {
        bun outdated
    }
    catch {
        Write-Host "No outdated packages in root"
    }
    
    # Check each service
    Get-ChildItem -Path "apps" -Directory | ForEach-Object {
        if (Test-Path "$($_.FullName)\package.json") {
            Write-Status "Outdated packages in $($_.Name):"
            Push-Location $_.FullName
            try {
                bun outdated
            }
            catch {
                Write-Host "No outdated packages in $($_.Name)"
            }
            Pop-Location
        }
    }
    
    # Check shared package
    if (Test-Path "packages\shared\package.json") {
        Write-Status "Outdated packages in shared:"
        Push-Location "packages\shared"
        try {
            bun outdated
        }
        catch {
            Write-Host "No outdated packages in shared"
        }
        Pop-Location
    }
}

# Function to clean and reinstall
function Invoke-CleanInstall {
    Write-Status "Cleaning and reinstalling dependencies..."
    
    # Remove node_modules and lock files
    Write-Status "Removing node_modules and lock files..."
    if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" }
    if (Test-Path "bun.lockb") { Remove-Item -Force "bun.lockb" }
    
    # Remove service node_modules
    Get-ChildItem -Path "apps" -Directory | ForEach-Object {
        if (Test-Path "$($_.FullName)\node_modules") {
            Remove-Item -Recurse -Force "$($_.FullName)\node_modules"
        }
    }
    
    # Remove shared package node_modules
    if (Test-Path "packages\shared\node_modules") {
        Remove-Item -Recurse -Force "packages\shared\node_modules"
    }
    
    # Reinstall dependencies
    Write-Status "Reinstalling dependencies..."
    bun install
    
    Write-Success "Clean installation completed!"
}

# Show help if requested
if ($Help) {
    Show-Usage
    exit 0
}

# Execute based on parameters
if ($Audit) {
    Invoke-Audit
}

if ($Update) {
    Update-Dependencies
}

if ($UpdateLatest) {
    Update-Latest
}

if ($FixVulnerabilities) {
    Fix-Vulnerabilities
}

if ($CheckOutdated) {
    Test-Outdated
}

if ($Clean) {
    Invoke-CleanInstall
}

# If no parameters provided, show usage
if (-not ($Audit -or $Update -or $UpdateLatest -or $FixVulnerabilities -or $CheckOutdated -or $Clean)) {
    Show-Usage
}

Write-Success "Security and dependency management completed!"
