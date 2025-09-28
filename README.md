# Blazing Helper Trakt Proxy

Ultra-secure Trakt OAuth proxy server designed for Kodi addons and other applications requiring secure Trakt.tv integration. Built with TypeScript, comprehensive security features, and database persistence support.

## Features

- **Secure OAuth Proxy**: Handles Trakt.tv OAuth flows without exposing client secrets
- **Multiple Database Backends**: Memory, SQLite, and PostgreSQL support
- **Production Ready**: Designed for Railway deployment with automatic scaling
- **Advanced Security**: Rate limiting, bot detection, CORS protection, and request validation
- **Token Management**: Intelligent caching with TTL and refresh capabilities
- **Device Flow Support**: Complete OAuth device code flow implementation
- **Comprehensive Logging**: Detailed request monitoring and analytics
- **Type Safety**: Full TypeScript implementation with strict type checking

## Quick Start

### Prerequisites

- Node.js 16.0.0 or higher
- npm 8.0.0 or higher
- Trakt.tv application credentials

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/blazing-trakt-proxy.git
cd blazing-trakt-proxy
```

2. Install dependencies:
```bash
npm install
```

3. Create environment configuration:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```bash
TRAKT_CLIENT_ID=your_trakt_client_id
TRAKT_CLIENT_SECRET=your_trakt_client_secret
API_KEY_HASH=your_sha256_hashed_api_key
```

5. Build and start:
```bash
npm run build
npm start
```

## Configuration

### Required Environment Variables

```bash
# Trakt API Configuration
TRAKT_CLIENT_ID=your_client_id_from_trakt
TRAKT_CLIENT_SECRET=your_client_secret_from_trakt

# Security Configuration
API_KEY_HASH=sha256_hash_of_your_api_key

# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://localhost
```

### Optional Environment Variables

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Database Configuration
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://user:pass@host:port/db

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=20

# Token Caching
TOKEN_CACHE_TTL=3600

# HTTPS Configuration
ENABLE_HTTPS=true
HTTPS_KEY_PATH=/path/to/private-key.pem
HTTPS_CERT_PATH=/path/to/certificate.pem
```

## Database Support

### Memory Database (Default)
Perfect for testing and development:
```bash
DATABASE_TYPE=memory
```

### SQLite Database
Ideal for local development:
```bash
DATABASE_TYPE=sqlite
SQLITE_FILENAME=trakt-proxy.db
```

### PostgreSQL Database (Recommended for Production)
For Railway and production deployments:
```bash
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://user:pass@host:port/database
```

## API Endpoints

### Public Endpoints

#### GET /health
Basic health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1640995200000,
  "uptime": 300,
  "version": "1.0.0",
  "environment": "production",
  "database": {
    "connected": true,
    "type": "postgresql"
  }
}
```

#### GET /metrics
Application metrics and statistics.

### Protected Endpoints (Require API Key)

All protected endpoints require either:
- `Authorization: Bearer YOUR_API_KEY` header
- `X-API-Key: YOUR_API_KEY` header

#### POST /trakt/exchange-token
Exchange authorization code for access token.

**Request:**
```json
{
  "auth_code": "authorization_code_from_trakt",
  "client_id": "proxy-handled",
  "redirect_uri": "urn:ietf:wg:oauth:2.0:oob"
}
```

**Response:**
```json
{
  "access_token": "access_token",
  "refresh_token": "refresh_token",
  "expires_in": 3600,
  "token_type": "Bearer",
  "scope": "public"
}
```

#### POST /trakt/refresh-token
Refresh an expired access token.

**Request:**
```json
{
  "refresh_token": "refresh_token",
  "client_id": "proxy-handled"
}
```

#### POST /trakt/device-token
Exchange device code for access token.

**Request:**
```json
{
  "device_code": "device_code_from_trakt",
  "client_id": "proxy-handled"
}
```

#### POST /trakt/revoke-token
Revoke an access token.

**Request:**
```json
{
  "access_token": "token_to_revoke",
  "client_id": "proxy-handled"
}
```

## Security Features

### API Key Authentication
- Timing-safe SHA-256 hash comparison
- Support for Bearer token and X-API-Key headers
- Configurable key strength validation

### Rate Limiting
- Global and endpoint-specific limits
- Bot detection with behavioral analysis
- Automatic IP blocking for abuse
- Configurable time windows and thresholds

### Request Validation
- Input sanitization to prevent XSS
- Request size limits
- Suspicious pattern detection
- Slowloris attack protection

### CORS Protection
- Configurable allowed origins
- Automatic localhost detection in development
- Wildcard origin warnings in production

## Deployment

### Railway Deployment (Recommended)

1. Push your code to GitHub
2. Connect repository to Railway
3. Add PostgreSQL service in Railway dashboard
4. Set environment variables:
```bash
TRAKT_CLIENT_ID=your_client_id
TRAKT_CLIENT_SECRET=your_client_secret
API_KEY_HASH=your_hashed_api_key
ALLOWED_ORIGINS=https://yourdomain.com
NODE_ENV=production
```

Railway automatically configures:
- `DATABASE_URL` from PostgreSQL service
- `PORT` assignment
- SSL termination
- Health checks

### Docker Deployment

```bash
# Build Docker image
docker build -t blazing-trakt-proxy .

# Run with environment file
docker run -p 3000:3000 --env-file .env blazing-trakt-proxy
```

### Manual Deployment

1. Build the application:
```bash
npm run build
```

2. Set production environment variables
3. Start the application:
```bash
npm start
```

## Development

### Scripts

```bash
# Development with auto-reload
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format

# Type checking
npm run type-check
```

### Testing Database Configurations

Test all database types locally:
```bash
chmod +x scripts/test-database.sh
./scripts/test-database.sh
```

## Kodi Addon Integration

### Example Usage in Python Addon

```python
import requests
import json

class TraktProxy:
    def __init__(self, proxy_url, api_key):
        self.proxy_url = proxy_url
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
    
    def exchange_token(self, auth_code):
        """Exchange authorization code for access token"""
        data = {
            'auth_code': auth_code,
            'client_id': 'proxy-handled'
        }
        
        response = requests.post(
            f'{self.proxy_url}/trakt/exchange-token',
            headers=self.headers,
            json=data
        )
        
        return response.json()
    
    def refresh_token(self, refresh_token):
        """Refresh an expired token"""
        data = {
            'refresh_token': refresh_token,
            'client_id': 'proxy-handled'
        }
        
        response = requests.post(
            f'{self.proxy_url}/trakt/refresh-token',
            headers=self.headers,
            json=data
        )
        
        return response.json()

# Usage
proxy = TraktProxy('https://your-proxy.railway.app', 'your-api-key')
tokens = proxy.exchange_token('authorization-code-from-trakt')
```

## Monitoring and Maintenance

### Health Monitoring

Check application health:
```bash
curl https://your-proxy.railway.app/health
```

### Metrics Collection

Get detailed metrics:
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://your-proxy.railway.app/metrics
```

### Log Analysis

Application logs include:
- Request/response timing
- Security events
- Database operations
- Error tracking
- Performance metrics

## Troubleshooting

### Common Issues

**SQLite Connection Errors**
```bash
# Install build dependencies
npm install bindings
npm rebuild better-sqlite3
```

**Port Already in Use**
```bash
# Change port in .env
PORT=3001
```

**CORS Errors**
```bash
# Add your domain to allowed origins
ALLOWED_ORIGINS=https://yourdomain.com,https://localhost
```

**Authentication Failures**
```bash
# Generate proper API key hash
echo -n "your-api-key" | openssl dgst -sha256
```

### Debug Mode

Enable detailed logging:
```bash
ENABLE_DETAILED_LOGGING=true
NODE_ENV=development
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes with tests
4. Run the test suite: `npm test`
5. Submit a pull request

### Development Guidelines

- Follow TypeScript strict mode
- Add tests for new features
- Update documentation
- Follow security best practices
- Use semantic commit messages

## License

This project is licensed under the GPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## Security

### Reporting Security Issues

Please report security vulnerabilities to: security@yourdomain.com

### Security Considerations

- API keys are hashed using SHA-256
- All inputs are sanitized and validated
- Rate limiting prevents abuse
- HTTPS is enforced in production
- Database connections use SSL in production
- No sensitive data is logged

## Support

- **Documentation**: Check this README and inline code comments
- **Issues**: Use GitHub Issues for bug reports and feature requests
- **Discussions**: Use GitHub Discussions for questions and community support

## Changelog

### Version 1.0.0 (Initial Release)
- Complete TypeScript implementation with strict type checking
- Secure Trakt OAuth proxy with API key authentication
- Multiple database backends: Memory, SQLite, and PostgreSQL
- Advanced security features: rate limiting, bot detection, CORS protection
- Token management with intelligent caching and refresh capabilities
- Complete OAuth device code flow support
- Production-ready Railway deployment configuration
- Comprehensive request validation and input sanitization
- Detailed logging and monitoring capabilities
- Full API documentation and Kodi integration examples

---

**Built with security and reliability in mind for the Kodi community.**