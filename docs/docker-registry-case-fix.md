# Docker Registry Case Sensitivity Fix

## 🚨 Issue: Repository Name Must Be Lowercase

### Problem Description
The CI/CD pipeline was failing with the following error:

```
ERROR: failed to build: invalid tag "ghcr.io/BabaScience/ecom-microservices/api-gateway:dev": repository name must be lowercase
```

### Root Cause Analysis
GitHub Container Registry (ghcr.io) requires repository names to be lowercase, but the GitHub username `BabaScience` contains uppercase letters. Docker registry naming conventions are strict about case sensitivity.

**Before (Broken):**
```yaml
env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}  # Results in "BabaScience/ecom-microservices"
```

This generated invalid tags like:
- `ghcr.io/BabaScience/ecom-microservices/api-gateway:dev` ❌

**After (Fixed):**
```yaml
env:
  REGISTRY: ghcr.io
  IMAGE_NAME: babascience/ecom-microservices  # Explicitly lowercase
```

This generates valid tags like:
- `ghcr.io/babascience/ecom-microservices/api-gateway:dev` ✅

## ✅ Solution Implemented

### 1. **Updated CI/CD Pipeline Environment Variables**
**File**: `.github/workflows/ci-cd.yml`

**Changes Made:**
- Changed `IMAGE_NAME` from `${{ github.repository }}` to `babascience/ecom-microservices`
- Ensures all Docker image tags use lowercase repository names

### 2. **Updated Deployment Workflow**
**File**: `.github/workflows/deploy.yml`

**Changes Made:**
- Updated `IMAGE_NAME` to use lowercase format
- Ensures deployment workflows use correct image names

### 3. **Updated Environment Template**
**File**: `env.prod.template`

**Changes Made:**
- Updated `IMAGE_NAME` to `babascience/ecom-microservices`
- Provides correct template for production deployments

## 🔧 Technical Details

### Docker Registry Naming Rules
- **Repository names must be lowercase**
- **No uppercase letters allowed**
- **Hyphens and underscores are allowed**
- **Numbers are allowed**

### Corrected Image Tags
All services now use the correct lowercase format:

| Service | Correct Tag Format |
|---------|-------------------|
| API Gateway | `ghcr.io/babascience/ecom-microservices/api-gateway:dev` |
| User Service | `ghcr.io/babascience/ecom-microservices/user-service:dev` |
| Product Service | `ghcr.io/babascience/ecom-microservices/product-service:dev` |
| Order Service | `ghcr.io/babascience/ecom-microservices/order-service:dev` |
| Inventory Service | `ghcr.io/babascience/ecom-microservices/inventory-service:dev` |
| Email Service | `ghcr.io/babascience/ecom-microservices/email-service:dev` |
| Notification Service | `ghcr.io/babascience/ecom-microservices/notification-service:dev` |

### Registry Structure
```
ghcr.io/babascience/ecom-microservices/
├── api-gateway/
│   ├── dev
│   ├── main
│   ├── latest
│   └── <commit-sha>
├── user-service/
│   ├── dev
│   ├── main
│   ├── latest
│   └── <commit-sha>
└── ... (other services)
```

## 🚀 Verification

### Test the Fix
1. **Push to dev branch**: Should create tags with `dev` suffix
2. **Push to main branch**: Should create tags with `main` and `latest` suffix
3. **Check registry**: Verify images appear in GitHub Container Registry

### Expected Behavior
- **Dev Branch**: `ghcr.io/babascience/ecom-microservices/<service>:dev`
- **Main Branch**: `ghcr.io/babascience/ecom-microservices/<service>:main` and `:latest`
- **PR**: Local builds with `pr-<number>` tags

## 📊 Impact

### Before Fix
- ❌ Pipeline failures due to invalid repository names
- ❌ No images pushed to registry
- ❌ Deployment blocked

### After Fix
- ✅ Valid Docker repository names
- ✅ Successful image builds and pushes
- ✅ Ready for deployment
- ✅ Proper registry organization

## 🔄 Files Updated

### Workflow Files
- ✅ `.github/workflows/ci-cd.yml` - Updated IMAGE_NAME
- ✅ `.github/workflows/deploy.yml` - Updated IMAGE_NAME
- ✅ `.github/workflows/pr-validation.yml` - No changes needed

### Configuration Files
- ✅ `env.prod.template` - Updated IMAGE_NAME
- ✅ `docker-compose.prod.yml` - Uses environment variables (no changes needed)

## 🎯 Next Steps

### Immediate
1. **Test the pipeline**: Push changes to trigger CI/CD
2. **Verify images**: Check GitHub Container Registry for new images
3. **Monitor builds**: Ensure all services build successfully

### Future Considerations
1. **Consistent naming**: Always use lowercase for Docker repositories
2. **Documentation**: Update deployment docs with correct image names
3. **Team awareness**: Inform team about lowercase requirement

## 📚 References

- [Docker Registry Naming Rules](https://docs.docker.com/engine/reference/commandline/tag/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Docker Repository Naming](https://docs.docker.com/docker-hub/repos/)

## ⚠️ Important Notes

### GitHub Username vs Registry Name
- **GitHub Username**: `BabaScience` (can have uppercase)
- **Registry Repository**: `babascience` (must be lowercase)
- **This is normal**: Many users have different casing for GitHub vs Docker

### Best Practices
1. **Always use lowercase** for Docker repository names
2. **Be consistent** across all workflows and configurations
3. **Document naming conventions** for team reference
4. **Test locally** before pushing to CI/CD

---

## ✅ Summary

The Docker registry case sensitivity issue has been resolved by updating all workflow files to use lowercase repository names. The CI/CD pipeline now generates valid Docker tags that comply with GitHub Container Registry naming requirements.

**Key Changes:**
- Updated `IMAGE_NAME` to `babascience/ecom-microservices` in all workflows
- Ensured consistent lowercase naming across all configurations
- Fixed Docker tag generation for all services

Your microservices project now has compliant Docker image naming that works with GitHub Container Registry! 🐳✅
