# Quick Start Guide - CI/CD Pipeline Setup

## 🚀 Getting Started

Follow these steps to set up the CI/CD pipeline for your microservices project.

### 1. Repository Setup

Ensure your repository has the following structure:
```
.github/
  workflows/
    ci-cd.yml
    pr-validation.yml
    maintenance.yml
    deploy.yml
    reusable-deploy.yml
scripts/
  deploy.sh
  deploy.ps1
docs/
  ci-cd.md
docker-compose.prod.yml
env.prod.template
```

### 2. GitHub Secrets Configuration

Go to your GitHub repository → Settings → Secrets and variables → Actions, and add:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `DEPLOY_TOKEN` | Deployment authentication token | `your-deploy-token` |
| `DATABASE_URL` | Production database URL | `mongodb://user:pass@host:port/db` |
| `REDIS_URL` | Production Redis URL | `redis://user:pass@host:port` |
| `JWT_SECRET` | JWT signing secret | `your-super-secret-key` |
| `SENDGRID_API_KEY` | SendGrid API key | `SG.xxx` |
| `RESEND_API_KEY` | Resend API key | `re_xxx` |

### 3. Environment Files

Create environment-specific configuration files:

```bash
# Copy template and customize
cp env.prod.template .env.production
cp env.prod.template .env.staging

# Edit with your actual values
nano .env.production
nano .env.staging
```

### 4. Docker Registry Setup

The pipeline uses GitHub Container Registry by default. To use a different registry:

1. Update `REGISTRY` environment variable in workflows
2. Add registry login credentials to GitHub Secrets
3. Update image names in docker-compose files

### 5. Test the Pipeline

#### Trigger a Test Run

1. **Create a test branch:**
   ```bash
   git checkout -b test-ci-cd
   git commit --allow-empty -m "Test CI/CD pipeline"
   git push origin test-ci-cd
   ```

2. **Create a Pull Request:**
   - Go to GitHub repository
   - Create PR from `test-ci-cd` to `dev`
   - Watch the PR validation workflow run

3. **Test Manual Deployment:**
   - Go to Actions → "Environment Deployment"
   - Run workflow with staging environment
   - Monitor deployment progress

### 6. Configure Environments

Set up GitHub Environments for better control:

1. Go to Settings → Environments
2. Create `staging` and `production` environments
3. Add environment-specific secrets
4. Configure protection rules (optional)

### 7. Monitoring Setup

#### Enable Notifications

1. Go to Settings → Notifications
2. Configure email notifications for:
   - Workflow failures
   - Deployment status
   - Security alerts

#### Set Up Monitoring (Optional)

1. **Health Check Endpoints:** Already configured in services
2. **Metrics Collection:** Add Prometheus/Grafana if needed
3. **Log Aggregation:** Set up centralized logging

### 8. First Production Deployment

⚠️ **Important:** Test thoroughly in staging before production!

1. **Prepare Production Environment:**
   ```bash
   # Ensure production environment file is secure
   chmod 600 .env.production
   
   # Verify all secrets are set
   cat .env.production
   ```

2. **Deploy to Staging First:**
   ```bash
   # Test deployment script
   ./scripts/deploy.sh -e staging --dry-run
   
   # Actual deployment
   ./scripts/deploy.sh -e staging
   ```

3. **Deploy to Production:**
   ```bash
   # Use GitHub Actions or deployment script
   ./scripts/deploy.sh -e production
   ```

## 🔧 Customization

### Customize Workflows

Edit workflow files to match your needs:

- **Add more test types** in `ci-cd.yml`
- **Modify deployment strategy** in `deploy.yml`
- **Adjust maintenance schedule** in `maintenance.yml`

### Add New Services

When adding new services:

1. **Update Dockerfiles** following the existing pattern
2. **Add to docker-compose files**
3. **Update workflow matrices** to include new service
4. **Add health check endpoints**

### Customize Deployment Scripts

Modify deployment scripts for your infrastructure:

- **Add Kubernetes support** in `deploy.sh`
- **Integrate with cloud providers** (AWS, GCP, Azure)
- **Add database migration steps**

## 🚨 Troubleshooting

### Common Issues

#### Pipeline Won't Start
- Check workflow syntax in GitHub Actions
- Verify branch protection rules
- Ensure secrets are properly configured

#### Build Failures
- Check Dockerfile syntax
- Verify all dependencies are available
- Review build logs for specific errors

#### Deployment Failures
- Verify environment variables
- Check service health endpoints
- Review deployment logs

#### Security Scan Failures
- Update vulnerable dependencies
- Review Trivy scan results
- Configure ignore rules if needed

### Debug Commands

```bash
# Test Docker builds locally
docker build -t test-api-gateway -f apps/api-gateway/Dockerfile .

# Test service health
curl http://localhost:3000/health

# Check environment variables
docker-compose config

# View service logs
docker-compose logs api-gateway
```

## 📚 Next Steps

1. **Set up monitoring and alerting**
2. **Configure backup strategies**
3. **Implement blue-green deployments**
4. **Add performance testing**
5. **Set up log aggregation**
6. **Configure auto-scaling**

## 🆘 Support

If you encounter issues:

1. Check the [CI/CD Documentation](docs/ci-cd.md)
2. Review GitHub Actions logs
3. Test components individually
4. Create an issue with detailed logs

## 🎉 Success!

Once everything is working:

- ✅ Automated testing on every PR
- ✅ Automated deployments to staging/production
- ✅ Security scanning and vulnerability management
- ✅ Automated maintenance and updates
- ✅ Comprehensive monitoring and health checks

Your microservices are now ready for production with enterprise-grade CI/CD! 🚀
