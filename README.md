# Blazing Helper Trakt Proxy

Ultra-secure Trakt OAuth proxy server with database persistence, advanced security features, and production-ready architecture. Built for Kodi addons and other applications that need secure Trakt.tv authentication.

## 🌟 Features

### 🔐 Enterprise-Grade Security
- **Multi-layer Authentication**: API key hashing with timing-safe comparison
- **Advanced Rate Limiting**: Bot detection, IP tracking, and adaptive limits
- **CORS Protection**: Configurable origins with wildcard pattern support
- **Request Validation**: Input sanitization and attack pattern detection
- **Security Headers**: CSP, HSTS, XSS protection, and more

### 💾 Database Flexibility
- **Memory Storage**: Fast in-memory caching for development
- **SQLite**: Local persistence with WAL mode and optimizations
- **PostgreSQL**: Production-grade with connection pooling and SSL
- **Auto-Migration**: Seamless database schema updates

### 🚀 Production Ready
- **Railway Deployment**: One-click cloud deployment
- **Docker Support**: Containerized deployment
- **Health Monitoring**: Comprehensive health checks and metrics
- **Graceful Shutdown**: Clean resource cleanup on termination
- **Detailed Logging**: Structured logging with rotation

### 🔧 Developer Experience
- **TypeScript**: Full type safety and IDE support
- **Modular Architecture**: Clean separation of concerns
- **Comprehensive Testing**: Unit tests and integration tests
- **Management CLI**: Easy setup, testing, and maintenance
- **Hot Reload**: Development server with auto-restart

## 🚀 Quick Start

### Prerequisites

- **Node.js** 16.0.0 or higher
- **npm** 8.0.0 or higher
- **Trakt.tv Application** ([Create one here](https://trakt.tv/oauth/applications))

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/DeFiNiek/blazing-trakt-proxy.git
cd blazing-trakt-proxy

# Install dependencies
npm install
```

### 2. Quick Setup

```bash
# Run the complete setup wizard
npm run security:setup

# Or use the manager script directly
./scripts/manager.sh setup
```

This will:
- Generate a secure API key
- Create a `.env` file with secure defaults
- Install all dependencies
- Validate your configuration

### 3. Configure Trakt Credentials

Edit the generated `.env` file and add your Trakt application credentials:

```env
# Replace with your actual Trakt application credentials
TRAKT_CLIENT_ID=your_actual_trakt_client_id
TRAKT_CLIENT_SECRET=your_actual_trakt_client_secret
```

### 4. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

Your proxy server will be available at `http://localhost:3000`

## 🛠️ Manager Script Usage

The `manager.sh` script provides a unified interface for all operations:

### Setup Commands
```bash
# Complete first-time setup
./scripts/manager.sh setup

# Generate .env file only
./scripts/manager.sh setup-env

# Install dependencies only
./scripts/manager.sh setup-deps

# Setup development environment with HTTPS certificates
./scripts/manager.sh setup-dev
```

### Security Commands
```bash
# Generate new API key and hash
./scripts/manager.sh generate-key

# Hash an existing API key
./scripts/manager.sh hash <your-api-key>

# Run comprehensive security validation
./scripts/manager.sh security-check

# Generate self-signed certificate for development
./scripts/manager.sh cert-dev
```

### Server Commands
```bash
# Start production server
./scripts/manager.sh start

# Start development server with auto-reload
./scripts/manager.sh dev

# Build TypeScript project
./scripts/manager.sh build

# Clean build artifacts
./scripts/manager.sh clean

# Stop running server processes
./scripts/manager.sh stop
```

### Testing Commands
```bash
# Test all database configurations
./scripts/manager.sh test-db

# Test HTTPS endpoints and OAuth flows
./scripts/manager.sh test-https

# Run all tests (database + HTTPS + security)
./scripts/manager.sh test-all

# Check server health endpoints
./scripts/manager.sh health

# Real-time monitoring dashboard
./scripts/manager.sh monitor
```

### Deployment Commands
```bash
# Show complete deployment guide
./scripts/manager.sh deploy-guide

# Build Docker image
./scripts/manager.sh docker-build

# Run in Docker container
./scripts/manager.sh docker-run

# Validate production readiness
./scripts/manager.sh production-check
```

### Maintenance Commands
```bash
# Show recent server logs
./scripts/manager.sh logs

# Update dependencies
./scripts/manager.sh update

# Backup configuration and data
./scripts/manager.sh backup

# Reset to clean state (keeps .env)
./scripts/manager.sh reset
```

## 🗄️ Database Configuration

### Memory (Default for Development)
```env
DATABASE_TYPE=memory
```
- Fast, no persistence
- Perfect for development and testing
- Data lost on restart

### SQLite (Local Persistence)
```env
DATABASE_TYPE=sqlite
SQLITE_FILENAME=trakt-proxy.db
```
- Local file-based storage
- Good for single-instance deployments
- Automatic WAL mode for performance

### PostgreSQL (Production)
```env
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://user:password@host:5432/database
# Railway provides this automatically
```
- Full ACID compliance
- Connection pooling and SSL support
- Ideal for production and scaling

### Railway Auto-Detection
The proxy automatically detects Railway PostgreSQL and configures itself:
- Reads `DATABASE_URL` environment variable
- Enables SSL for cloud connections
- Sets appropriate pool sizes

## 🚦 API Endpoints

### Public Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/health` | Basic health check | No |
| GET | `/metrics` | Application metrics | No |

### Protected Endpoints (Require API Key)

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| POST | `/trakt/exchange-token` | Exchange auth code for token | 3/5min |
| POST | `/trakt/refresh-token` | Refresh expired token | 10/min |
| POST | `/trakt/device-token` | Exchange device code | 15/min |
| POST | `/trakt/revoke-token` | Revoke access token | 20/min |
| GET | `/diagnostics` | System diagnostics | Standard |

### Authentication

Include your API key in requests using one of these methods:

```bash
# Bearer token in Authorization header
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://your-proxy.com/trakt/exchange-token

# X-API-Key header
curl -H "X-API-Key: YOUR_API_KEY" \
     https://your-proxy.com/trakt/exchange-token
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TRAKT_CLIENT_ID` | Your Trakt application client ID | - | ✅ |
| `TRAKT_CLIENT_SECRET` | Your Trakt application client secret | - | ✅ |
| `API_KEY_HASH` | SHA-256 hash of your API key | - | ✅ |
| `PORT` | Server port | `3000` | No |
| `HOST` | Server host | `0.0.0.0` | No |
| `NODE_ENV` | Environment mode | `development` | No |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | `http://localhost,https://localhost` | No |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | `60000` | No |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `20` | No |
| `ENABLE_HTTPS` | Enable HTTPS server | `false` | No |
| `TOKEN_CACHE_TTL` | Token cache TTL in seconds | `3600` | No |

### Database Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_TYPE` | Database type | `postgresql`, `sqlite`, `memory` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SQLITE_FILENAME` | SQLite database file | `trakt-proxy.db` |
| `DB_SSL` | Enable SSL for database | `true` |
| `DB_POOL_SIZE` | Connection pool size | `10` |

## 🚀 Deployment

### Railway (Recommended)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/your-username/your-repo.git
   git push -u origin main
   ```

2. **Deploy to Railway**
   - Connect your GitHub repository to Railway
   - Add PostgreSQL service
   - Set environment variables:
     ```
     TRAKT_CLIENT_ID=your_client_id
     TRAKT_CLIENT_SECRET=your_client_secret
     API_KEY_HASH=your_api_key_hash
     NODE_ENV=production
     ```

3. **The proxy will automatically**:
   - Detect the PostgreSQL database
   - Run migrations
   - Start in production mode

### Docker

```bash
# Build image
docker build -t blazing-trakt-proxy .

# Run container
docker run -p 3000:3000 --env-file .env blazing-trakt-proxy
```

### Manual VPS Deployment

```bash
# Install Node.js 16+
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and build
git clone https://github.com/your-username/your-repo.git
cd blazing-trakt-proxy
npm install
npm run build

# Create systemd service
sudo cp deployment/blazing-trakt-proxy.service /etc/systemd/system/
sudo systemctl enable blazing-trakt-proxy
sudo systemctl start blazing-trakt-proxy
```

## 🔍 Monitoring & Health Checks

### Health Endpoints

```bash
# Basic health check
curl http://localhost:3000/health

# Detailed metrics
curl http://localhost:3000/metrics

# System diagnostics (requires API key)
curl -H "X-API-Key: YOUR_KEY" http://localhost:3000/diagnostics
```

### Real-time Monitoring

```bash
# Start monitoring dashboard
./scripts/manager.sh monitor

# View recent logs
./scripts/manager.sh logs
```

### Health Check Response Example

```json
{
  "status": "healthy",
  "timestamp": 1703875200000,
  "uptime": 3600,
  "version": "2.1.0",
  "environment": "production",
  "memory": {
    "used": 125,
    "total": 256
  },
  "database": {
    "connected": true,
    "type": "postgresql"
  }
}
```

## 🔒 Security Best Practices

### API Key Management
- **Generate Strong Keys**: Use the built-in generator: `./scripts/manager.sh generate-key`
- **Store Securely**: Keep API keys in environment variables, never in code
- **Rotate Regularly**: Generate new keys periodically
- **Hash Storage**: Always store hashed versions, never plaintext

### Production Security
- **Enable HTTPS**: Use SSL certificates in production
- **Restrict CORS**: Set specific allowed origins, avoid wildcards
- **Monitor Logs**: Watch for suspicious activity patterns
- **Rate Limiting**: Adjust limits based on your usage patterns
- **Database Security**: Use SSL connections for external databases

### Network Security
```bash
# Example production CORS configuration
ALLOWED_ORIGINS=https://your-app.com,https://your-kodi-instance.local

# Enable HTTPS
ENABLE_HTTPS=true
HTTPS_KEY_PATH=/path/to/private-key.pem
HTTPS_CERT_PATH=/path/to/certificate.pem
```

## 🧪 Testing

### Run All Tests
```bash
# Complete test suite
npm test

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test Specific Components
```bash
# Database tests
./scripts/manager.sh test-db

# HTTPS endpoint tests
./scripts/manager.sh test-https

# Security validation
./scripts/manager.sh security-check
```

## 📊 Performance Tuning

### Database Optimization

**SQLite:**
```env
# Enable WAL mode for better performance
# Automatically enabled by the proxy
```

**PostgreSQL:**
```env
# Optimize connection pool
DB_POOL_SIZE=20
DB_MAX_CONNECTIONS=50
DB_IDLE_TIMEOUT=30000
```

### Memory Management
```env
# Adjust cache TTL based on usage
TOKEN_CACHE_TTL=7200  # 2 hours

# Rate limiting window
RATE_LIMIT_WINDOW_MS=60000  # 1 minute
RATE_LIMIT_MAX_REQUESTS=50  # Higher for busy instances
```

### Monitoring Performance
```bash
# Real-time performance monitoring
./scripts/manager.sh monitor

# Check memory usage
curl http://localhost:3000/metrics | jq '.memory'

# Database performance
curl -H "X-API-Key: YOUR_KEY" http://localhost:3000/diagnostics | jq '.performance'
```

---

## 👨‍💻 Developer Guide

### Project Structure

```
src/
├── core/                 # Application core
│   ├── application.ts    # Main application class
│   ├── container.ts      # Dependency injection
│   └── server.ts         # HTTP server
├── controllers/          # Request handlers
│   ├── base-controller.ts
│   ├── health-controller.ts
│   └── trakt-controller.ts
├── middleware/           # Request middleware
│   ├── auth-middleware.ts
│   ├── cors-middleware.ts
│   ├── ratelimit-middleware.ts
│   └── security-middleware.ts
├── services/             # Business logic
│   ├── database/         # Database adapters
│   ├── logging-service.ts
│   ├── ratelimit-service.ts
│   ├── token-cache-service.ts
│   └── trakt-service.ts
├── routes/               # URL routing
│   ├── index.ts
│   └── router.ts
├── types/                # TypeScript types
│   ├── config.ts
│   ├── database.ts
│   ├── http.ts
│   └── trakt.ts
├── utils/                # Utility functions
│   ├── config-loader.ts
│   ├── error-utils.ts
│   ├── security-utils.ts
│   └── validation-utils.ts
└── server.ts            # Entry point
```

### Architecture Overview

The project follows clean architecture principles with clear separation of concerns:

1. **Entry Point** (`server.ts`): Bootstraps the application
2. **Application Core** (`core/`): Application lifecycle and DI container
3. **HTTP Layer** (`controllers/`, `middleware/`, `routes/`): Request handling
4. **Business Logic** (`services/`): Core functionality
5. **Data Layer** (`services/database/`): Persistence abstraction
6. **Utilities** (`utils/`): Shared helper functions

### Key Design Patterns

- **Dependency Injection**: Clean service registration and resolution
- **Repository Pattern**: Database abstraction with multiple adapters
- **Middleware Pattern**: Composable request processing
- **Factory Pattern**: Dynamic database adapter creation
- **Observer Pattern**: Event-driven logging and monitoring

### Development Setup

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Run type checking
npm run type-check

# Lint code
npm run lint

# Format code
npm run format
```

### Creating a New Controller

```typescript
// src/controllers/example-controller.ts
import { BaseController } from './base-controller';
import { RequestContext, ResponseContext } from '../types/http';

export class ExampleController extends BaseController {
    public async handle(context: RequestContext): Promise<ResponseContext> {
        const { path, method } = context;

        switch (true) {
            case method === 'GET' && path === '/example':
                return this.getExample(context);
            
            default:
                return this.createErrorResponse(404, 'Endpoint not found');
        }
    }

    private async getExample(context: RequestContext): Promise<ResponseContext> {
        this.logAction('getExample', context);
        
        return this.createSuccessResponse({
            message: 'Hello from example controller!',
            timestamp: Date.now(),
        });
    }
}
```

### Adding a New Database Adapter

```typescript
// src/services/database/redis-adapter.ts
import { DatabaseAdapter, DatabaseStats } from '../../types/database';
import { CachedToken } from '../../types/trakt';
import { LogEntry, RateLimitEntry } from '../../types/http';

export class RedisAdapter implements DatabaseAdapter {
    async connect(): Promise<void> {
        // Implementation
    }

    async disconnect(): Promise<void> {
        // Implementation
    }

    async healthCheck(): Promise<boolean> {
        // Implementation
    }

    // Implement all required methods...
}
```

### Creating Custom Middleware

```typescript
// src/middleware/custom-middleware.ts
import { IncomingMessage, ServerResponse } from 'http';
import { RequestContext, Middleware } from '../types/http';

export class CustomMiddleware {
    public middleware(): Middleware {
        return async (
            req: IncomingMessage,
            res: ServerResponse,
            context: RequestContext,
            next: () => Promise<void>
        ) => {
            // Pre-processing
            console.log(`Request: ${context.method} ${context.path}`);

            // Continue to next middleware
            await next();

            // Post-processing
            console.log('Request completed');
        };
    }
}
```

### Environment Configuration

The configuration system supports multiple environments:

```typescript
// Development
NODE_ENV=development
DATABASE_TYPE=sqlite
ENABLE_DETAILED_LOGGING=true

// Production
NODE_ENV=production
DATABASE_TYPE=postgresql
ENABLE_HTTPS=true
```

### Testing Guidelines

```typescript
// tests/controllers/health-controller.test.ts
import { HealthController } from '../../src/controllers/health-controller';
import { createMockContext } from '../helpers/mock-helpers';

describe('HealthController', () => {
    let controller: HealthController;

    beforeEach(() => {
        controller = new HealthController(/* dependencies */);
    });

    it('should return health status', async () => {
        const context = createMockContext('GET', '/health');
        const response = await controller.handle(context);

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe('healthy');
    });
});
```

### Database Migrations

Database migrations are handled automatically on startup:

```typescript
// Example migration in PostgreSQL adapter
const migrations: Migration[] = [
    {
        name: 'add_user_agent_index',
        sql: 'CREATE INDEX IF NOT EXISTS idx_logs_user_agent ON request_logs(user_agent)'
    }
];
```

### Error Handling

Use the standardized error utilities:

```typescript
import { ErrorUtils, ValidationError } from '../utils/error-utils';

// Create validation error
throw new ValidationError(['Field is required'], ['Field should be longer']);

// Create custom error response
return ErrorUtils.createErrorResponse(400, 'Custom error message');
```

### Adding New Validation Rules

```typescript
// src/utils/validation-utils.ts
export const customSchema = {
    customField: {
        required: true,
        type: 'string',
        custom: (value: string) => {
            if (!value.startsWith('custom_')) {
                return 'Field must start with "custom_"';
            }
            return true;
        }
    }
};
```

### Performance Monitoring

Add custom metrics to any service:

```typescript
export class CustomService {
    private metrics = {
        requestCount: 0,
        errorCount: 0,
        averageResponseTime: 0
    };

    public getMetrics() {
        return { ...this.metrics };
    }
}
```

### Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** following the coding standards
4. **Add tests** for new functionality
5. **Run the test suite**: `npm test`
6. **Commit changes**: `git commit -m 'Add amazing feature'`
7. **Push to branch**: `git push origin feature/amazing-feature`
8. **Open a Pull Request**

### Code Style

- Use TypeScript with strict mode enabled
- Follow ESLint and Prettier configurations
- Write comprehensive JSDoc comments
- Maintain test coverage above 70%
- Use meaningful variable and function names

### Build and Deployment

```bash
# Development build
npm run build

# Production build with optimizations
npm run production:build

# Docker build
npm run docker:build
```

## 📝 License

This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📚 Documentation

- [API Documentation](docs/API.md)
- [Security Guide](docs/SECURITY.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Development Setup](docs/DEVELOPMENT.md)

## 🔗 Links

- [Trakt.tv API Documentation](https://trakt.docs.apiary.io/)
- [OAuth 2.0 Specification](https://tools.ietf.org/html/rfc6749)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/DeFiNiek/blazing-trakt-proxy/issues)
- **Discussions**: [GitHub Discussions](https://github.com/DeFiNiek/blazing-trakt-proxy/discussions)
- **Email**: definiek@gmail.com

---

<div align="center">
Made with ❤️ by <a href="https://github.com/DeFiNiek">DeFiNiek</a>
</div>