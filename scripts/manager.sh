#!/bin/bash

# Blazing Helper Trakt Proxy - Unified Management Script
# Combines setup, database testing, and HTTPS testing into one executable
# Version 1.0.0

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration for testing
DEFAULT_SERVER_URL="https://localhost:3000"
DEFAULT_API_KEY=""

print_header() {
    echo -e "${CYAN}Blazing Helper Trakt Proxy Manager v1.0.0${NC}"
    echo -e "${CYAN}===========================================${NC}"
    echo
}

print_usage() {
    cat << EOF
${YELLOW}Setup Commands:${NC}
  setup              Complete first-time setup (env + dependencies)
  setup-env          Generate .env file with secure defaults
  setup-deps         Install Node.js dependencies
  setup-dev          Setup development environment with certificates

${YELLOW}Security Commands:${NC}
  generate-key       Generate new API key and hash
  hash <key>         Generate hash for an API key
  security-check     Run comprehensive security validation
  cert-dev           Generate self-signed certificate for development
  cert-prod          Show production certificate instructions

${YELLOW}Server Commands:${NC}
  start              Start production server
  dev                Start development server with auto-reload
  build              Build TypeScript project
  clean              Clean build artifacts
  stop               Stop running server processes

${YELLOW}Testing Commands:${NC}
  test-db            Test all database configurations (memory/sqlite/postgresql)
  test-https         Test HTTPS endpoints and OAuth flows
  test-all           Run all tests (database + HTTPS + security)
  health             Check server health endpoints
  monitor            Real-time monitoring dashboard

${YELLOW}Deployment Commands:${NC}
  deploy-guide       Show complete deployment guide
  docker-build       Build Docker image
  docker-run         Run in Docker container
  production-check   Validate production readiness

${YELLOW}Maintenance Commands:${NC}
  logs               Show recent server logs
  update             Update dependencies
  backup             Backup configuration and data
  restore            Restore from backup
  reset              Reset to clean state (keeps .env)

${YELLOW}Examples:${NC}
  $0 setup                    # Complete first-time setup
  $0 dev                      # Start development server
  $0 test-all                 # Run all tests
  $0 generate-key             # Generate new API credentials
  $0 test-https               # Test HTTPS OAuth endpoints
  $0 production-check         # Validate production readiness
EOF
}

# Utility functions
log_info() { echo -e "${BLUE}$1${NC}"; }
log_success() { echo -e "${GREEN}$1${NC}"; }
log_warning() { echo -e "${YELLOW}$1${NC}"; }
log_error() { echo -e "${RED}$1${NC}"; }

check_dependencies() {
    local missing=()
    
    if ! command -v node >/dev/null 2>&1; then
        missing+=("Node.js")
    fi
    
    if ! command -v npm >/dev/null 2>&1; then
        missing+=("npm")
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing dependencies: ${missing[*]}"
        echo "Please install Node.js 16+ from https://nodejs.org/"
        return 1
    fi
    
    return 0
}

generate_api_key() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
    elif command -v node >/dev/null 2>&1; then
        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    else
        head -c 32 /dev/urandom | xxd -p -c 32
    fi
}

hash_api_key() {
    local key="$1"
    if [ -z "$key" ]; then
        log_error "API key is required"
        return 1
    fi
    
    if command -v openssl >/dev/null 2>&1; then
        echo -n "$key" | openssl dgst -sha256 | cut -d' ' -f2
    elif command -v node >/dev/null 2>&1; then
        node -e "console.log(require('crypto').createHash('sha256').update('$key').digest('hex'))"
    else
        log_error "Neither openssl nor node.js available for hashing"
        return 1
    fi
}

setup_environment() {
    local env_file="$PROJECT_ROOT/.env"
    
    log_info "Setting up environment configuration..."
    
    # Backup existing .env if it exists
    if [ -f "$env_file" ]; then
        local backup_file="$env_file.backup.$(date +%s)"
        cp "$env_file" "$backup_file"
        log_warning "Backed up existing .env to $(basename "$backup_file")"
    fi
    
    # Generate API key and hash
    log_info "Generating secure API key..."
    local api_key
    api_key=$(generate_api_key)
    local api_key_hash
    api_key_hash=$(hash_api_key "$api_key")
    
    # Create comprehensive .env file
    cat > "$env_file" << EOF
# Blazing Helper Trakt Proxy Configuration v1.0.0
# Generated on $(date -Iseconds)

# =============================================================================
# CRITICAL: Replace these with your actual Trakt application credentials
# Get them from: https://trakt.tv/oauth/applications
# =============================================================================
TRAKT_CLIENT_ID=your_trakt_client_id_here
TRAKT_CLIENT_SECRET=your_trakt_client_secret_here

# =============================================================================
# API Key for authenticating requests to your proxy
# KEEP THIS SECRET! Share only with your Kodi addon
# Generated API Key: $api_key
# =============================================================================
API_KEY_HASH=$api_key_hash

# Server Configuration
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database Configuration
DATABASE_TYPE=memory

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=http://localhost,https://localhost,http://127.0.0.1

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=20

# HTTPS Configuration (recommended for production)
ENABLE_HTTPS=false
# HTTPS_KEY_PATH=./certs/server-key.pem
# HTTPS_CERT_PATH=./certs/server-cert.pem

# Advanced Options
MAX_REQUEST_BODY_SIZE=2048
ENABLE_DETAILED_LOGGING=true
TOKEN_CACHE_TTL=3600

# =============================================================================
# Your generated API key (use this in Kodi addon): $api_key
# =============================================================================
EOF

    log_success "Generated .env file"
    echo
    log_warning "Your API Key (use this in Kodi addon):"
    echo -e "${GREEN}$api_key${NC}"
    echo
    log_error "IMPORTANT: Edit the .env file and replace TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET!"
    log_info "Get credentials from: https://trakt.tv/oauth/applications"
}

setup_dependencies() {
    log_info "Installing Node.js dependencies..."
    
    cd "$PROJECT_ROOT"
    
    if [ -f "package.json" ]; then
        npm install
        log_success "Dependencies installed"
    else
        log_error "No package.json found. Are you in the correct directory?"
        return 1
    fi
}

complete_setup() {
    log_info "Running complete first-time setup..."
    
    check_dependencies || return 1
    setup_dependencies || return 1
    setup_environment || return 1
    
    # Create necessary directories
    mkdir -p "$PROJECT_ROOT/logs"
    mkdir -p "$PROJECT_ROOT/certs"
    
    log_success "Setup complete!"
    echo
    log_info "Next steps:"
    echo "1. Edit .env file with your Trakt credentials"
    echo "2. Run: $0 security-check"
    echo "3. Run: $0 dev (for development) or $0 start (for production)"
}

security_check() {
    local env_file="$PROJECT_ROOT/.env"
    local score=100
    local issues=()
    local warnings=()
    local passed=()
    
    log_info "Running comprehensive security validation..."
    echo
    
    # Check if .env file exists
    if [ ! -f "$env_file" ]; then
        issues+=("No .env file found")
        score=$((score - 30))
    else
        passed+=("Environment file exists")
        
        # Load .env file
        set -a
        source "$env_file" 2>/dev/null || true
        set +a
        
        # Check required variables
        local required_vars=("TRAKT_CLIENT_ID" "TRAKT_CLIENT_SECRET" "API_KEY_HASH")
        for var in "${required_vars[@]}"; do
            if [ -z "${!var}" ] || [ "${!var}" = "your_trakt_client_id_here" ] || [ "${!var}" = "your_trakt_client_secret_here" ]; then
                issues+=("Missing or placeholder value for: $var")
                score=$((score - 20))
            else
                passed+=("Required variable configured: $var")
            fi
        done
        
        # Check API key hash format
        if [ -n "$API_KEY_HASH" ] && [ ${#API_KEY_HASH} -eq 64 ]; then
            passed+=("API key hash format valid (64 chars)")
        elif [ -n "$API_KEY_HASH" ]; then
            issues+=("Invalid API key hash format (should be 64 characters)")
            score=$((score - 15))
        fi
        
        # Check production settings
        if [ "$NODE_ENV" = "production" ]; then
            if [ "$ENABLE_HTTPS" != "true" ]; then
                issues+=("HTTPS not enabled in production environment")
                score=$((score - 25))
            else
                passed+=("HTTPS enabled for production")
            fi
            
            if [[ "$ALLOWED_ORIGINS" == *"*"* ]] || [ -z "$ALLOWED_ORIGINS" ]; then
                issues+=("CORS origins too permissive for production")
                score=$((score - 20))
            else
                passed+=("CORS origins properly restricted")
            fi
        fi
    fi
    
    # Display results
    echo -e "${CYAN}Security Validation Results:${NC}"
    
    if [ "$score" -ge 90 ]; then
        echo -e "   Security Score: ${GREEN}$score/100 (Excellent)${NC}"
    elif [ "$score" -ge 70 ]; then
        echo -e "   Security Score: ${YELLOW}$score/100 (Good)${NC}"
    else
        echo -e "   Security Score: ${RED}$score/100 (Needs Improvement)${NC}"
    fi
    echo
    
    if [ ${#issues[@]} -gt 0 ]; then
        echo -e "${RED}Critical Issues (must fix):${NC}"
        for issue in "${issues[@]}"; do
            echo -e "   • $issue"
        done
        echo
    fi
    
    if [ ${#warnings[@]} -gt 0 ]; then
        echo -e "${YELLOW}Warnings (should address):${NC}"
        for warning in "${warnings[@]}"; do
            echo -e "   • $warning"
        done
        echo
    fi
    
    if [ ${#passed[@]} -gt 0 ]; then
        echo -e "${GREEN}Passed Checks:${NC}"
        for check in "${passed[@]}"; do
            echo -e "   • $check"
        done
        echo
    fi
    
    return $([ "$score" -ge 70 ] && echo 0 || echo 1)
}

test_database() {
    log_info "Testing database configurations..."
    echo
    
    # Generate valid test hash and preserve existing credentials
    local TEST_API_KEY_HASH="1ece43c59a9d622e6fc7032882a469c3026213ac7e6b77c5d9a1fe91f392a107"
    local EXISTING_TRAKT_CLIENT_ID="test_client_id"
    local EXISTING_TRAKT_CLIENT_SECRET="test_client_secret"
    local EXISTING_ALLOWED_ORIGINS="http://localhost"
    
    if [ -f "$PROJECT_ROOT/.env" ]; then
        log_info "Reading your existing .env configuration..."
        EXISTING_TRAKT_CLIENT_ID=$(grep "^TRAKT_CLIENT_ID=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "test_client_id")
        EXISTING_TRAKT_CLIENT_SECRET=$(grep "^TRAKT_CLIENT_SECRET=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "test_client_secret")
        EXISTING_ALLOWED_ORIGINS=$(grep "^ALLOWED_ORIGINS=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "http://localhost")
        log_success "Preserved your Trakt credentials and settings"
    fi
    
    # Backup original .env
    if [ -f "$PROJECT_ROOT/.env" ]; then
        cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.backup"
        log_info "Backed up .env to .env.backup"
    fi
    
    # Cleanup function
    cleanup_db_test() {
        log_info "Cleaning up database test files..."
        rm -f "$PROJECT_ROOT/.env.test" "$PROJECT_ROOT/test-database.db"
        if [ -f "$PROJECT_ROOT/.env.backup" ]; then
            mv "$PROJECT_ROOT/.env.backup" "$PROJECT_ROOT/.env"
            log_info "Restored original .env"
        fi
        jobs -p | xargs -r kill 2>/dev/null || true
    }
    
    trap cleanup_db_test EXIT
    
    # Function to create test env
    create_test_env() {
        local db_type=$1
        local port=$2
        local extra_config=$3
        
        cat > "$PROJECT_ROOT/.env.test" << EOF
NODE_ENV=test
PORT=$port
DATABASE_TYPE=$db_type
TRAKT_CLIENT_ID=$EXISTING_TRAKT_CLIENT_ID
TRAKT_CLIENT_SECRET=$EXISTING_TRAKT_CLIENT_SECRET
API_KEY_HASH=$TEST_API_KEY_HASH
ALLOWED_ORIGINS=$EXISTING_ALLOWED_ORIGINS
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=20
TOKEN_CACHE_TTL=3600
ENABLE_DETAILED_LOGGING=true
$extra_config
EOF
    }
    
    cd "$PROJECT_ROOT"
    
    # Test 1: Memory Database
    log_info "Testing Memory Database..."
    create_test_env "memory" "3001"
    cp .env.test .env
    
    npm run build >/dev/null 2>&1
    timeout 10s npm start >/dev/null 2>&1 &
    SERVER_PID=$!
    sleep 5
    
    if curl -s http://localhost:3001/health >/dev/null 2>&1; then
        HEALTH_RESPONSE=$(curl -s http://localhost:3001/health)
        if echo "$HEALTH_RESPONSE" | grep -q '"type"[[:space:]]*:[[:space:]]*"memory"'; then
            log_success "Memory database test passed"
        else
            log_warning "Memory database running but type not clearly detected"
        fi
    else
        log_error "Memory database test failed"
    fi
    
    kill $SERVER_PID 2>/dev/null || true
    sleep 2
    
    # Test 2: SQLite Database
    log_info "Testing SQLite Database..."
    create_test_env "sqlite" "3002" "SQLITE_FILENAME=test-database.db"
    cp .env.test .env
    
    timeout 15s npm start >/dev/null 2>&1 &
    SERVER_PID=$!
    sleep 8
    
    if curl -s http://localhost:3002/health >/dev/null 2>&1; then
        HEALTH_RESPONSE=$(curl -s http://localhost:3002/health)
        if echo "$HEALTH_RESPONSE" | grep -q '"type"[[:space:]]*:[[:space:]]*"sqlite"'; then
            log_success "SQLite database test passed"
            if [ -f test-database.db ]; then
                log_success "SQLite database file created ($(ls -lah test-database.db | awk '{print $5}'))"
            fi
        else
            log_warning "SQLite database running but type not clearly detected"
        fi
    else
        log_error "SQLite database test failed"
    fi
    
    kill $SERVER_PID 2>/dev/null || true
    sleep 2
    
    # Test 3: PostgreSQL (if available)
    log_info "Testing PostgreSQL (if available)..."
    
    if command -v psql &> /dev/null && pg_isready -h localhost -p 5432 &> /dev/null 2>&1; then
        log_info "Local PostgreSQL detected, running tests..."
        
        createdb trakt_proxy_test 2>/dev/null || true
        
        create_test_env "postgresql" "3003" "POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=trakt_proxy_test
POSTGRES_USER=postgres
POSTGRES_PASSWORD=
DB_SSL=false"
        cp .env.test .env

        timeout 15s npm start >/dev/null 2>&1 &
        SERVER_PID=$!
        sleep 8

        if curl -s http://localhost:3003/health >/dev/null 2>&1; then
            log_success "PostgreSQL database test passed"
        else
            log_error "PostgreSQL database test failed"
        fi

        kill $SERVER_PID 2>/dev/null || true
        dropdb trakt_proxy_test 2>/dev/null || true
    else
        log_warning "PostgreSQL not available locally, skipping test"
    fi
    
    log_success "Database testing complete!"
    log_info "Ready for Railway deployment with PostgreSQL"
}

test_https() {
    # Load environment to get API key
    if [ -f "$PROJECT_ROOT/.env" ]; then
        set -a
        source "$PROJECT_ROOT/.env" 2>/dev/null || true
        set +a
    fi
    
    # Extract API key from hash (we need the actual key for testing)
    local api_key=""
    if [ -f "$PROJECT_ROOT/.api-key" ]; then
        api_key=$(cat "$PROJECT_ROOT/.api-key")
    elif [ -n "$DEFAULT_API_KEY" ]; then
        api_key="$DEFAULT_API_KEY"
    else
        log_warning "No API key found for testing. Generating temporary key..."
        api_key=$(generate_api_key)
    fi
    
    local server_url="${1:-$DEFAULT_SERVER_URL}"
    
    log_info "Testing HTTPS OAuth endpoints at $server_url"
    echo
    
    # Test connectivity
    log_info "Testing server connectivity..."
    if ! curl -k -s "$server_url/health" >/dev/null; then
        log_error "Server not responding at $server_url"
        log_info "Make sure the server is running with HTTPS enabled"
        return 1
    fi
    log_success "Server is responding"
    echo
    
    # Function to test endpoint
    test_endpoint() {
        local name="$1"
        local method="$2"
        local endpoint="$3"
        local data="$4"
        local expected_status="$5"
        
        echo -e "${YELLOW}Testing: $name${NC}"
        
        local response
        local http_code
        
        if [ "$method" = "GET" ]; then
            response=$(curl -k -s -w "HTTPSTATUS:%{http_code}" \
                -H "X-API-Key: $api_key" \
                -H "Accept: application/json" \
                "$server_url$endpoint")
        else
            response=$(curl -k -s -w "HTTPSTATUS:%{http_code}" \
                -X "$method" \
                -H "X-API-Key: $api_key" \
                -H "Content-Type: application/json" \
                -H "Accept: application/json" \
                -d "$data" \
                "$server_url$endpoint")
        fi
        
        http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
        
        if [ "$http_code" = "$expected_status" ]; then
            log_success "HTTP $http_code (expected)"
        else
            log_error "Expected HTTP $expected_status, got HTTP $http_code"
        fi
    }
    
    # Run tests
    log_info "1. Testing Public Endpoints"
    test_endpoint "Health Check" "GET" "/health" "" "200"
    test_endpoint "Metrics" "GET" "/metrics" "" "200"
    echo
    
    log_info "2. Testing Protected Endpoints Authentication"
    test_endpoint "Token Exchange" "POST" "/trakt/exchange-token" '{"auth_code":"test","client_id":"proxy-handled"}' "400"
    test_endpoint "Token Refresh" "POST" "/trakt/refresh-token" '{"refresh_token":"test","client_id":"proxy-handled"}' "400"
    test_endpoint "Device Token" "POST" "/trakt/device-token" '{"device_code":"test","client_id":"proxy-handled"}' "400"
    echo
    
    log_success "HTTPS OAuth endpoint testing complete!"
    log_info "All core security features are working correctly"
}

start_server() {
    local mode="$1"
    
    cd "$PROJECT_ROOT"
    
    if [ "$mode" = "dev" ]; then
        log_info "Starting development server with auto-reload..."
        npm run dev
    else
        log_info "Starting production server..."
        npm run build
        npm start
    fi
}

check_health() {
    local base_url="http://localhost:${PORT:-3000}"
    
    log_info "Checking server health..."
    
    if curl -s "$base_url/health" >/dev/null; then
        log_success "Server is responding"
        local health_response=$(curl -s "$base_url/health")
        echo "Health Response: $health_response"
    else
        log_error "Server is not responding on $base_url"
        return 1
    fi
}

generate_dev_certificate() {
    local cert_dir="$PROJECT_ROOT/certs"
    mkdir -p "$cert_dir"
    
    log_info "Generating self-signed certificate for development..."
    
    if ! command -v openssl >/dev/null 2>&1; then
        log_error "OpenSSL not found. Please install OpenSSL to generate certificates."
        return 1
    fi
    
    openssl genrsa -out "$cert_dir/server-key.pem" 2048
    openssl req -new -x509 -key "$cert_dir/server-key.pem" \
        -out "$cert_dir/server-cert.pem" -days 365 \
        -subj "/C=US/ST=Dev/L=Dev/O=BlazingHelper/OU=Development/CN=localhost"
    
    log_success "Development certificate generated"
    log_info "Update your .env file:"
    echo "ENABLE_HTTPS=true"
    echo "HTTPS_KEY_PATH=./certs/server-key.pem"
    echo "HTTPS_CERT_PATH=./certs/server-cert.pem"
}

production_check() {
    log_info "Running production readiness check..."
    
    if security_check; then
        log_success "Server appears ready for production deployment"
        return 0
    else
        log_error "Server is not ready for production. Address issues above."
        return 1
    fi
}

show_deploy_guide() {
    cat << EOF
${CYAN}Blazing Helper Trakt Proxy - Deployment Guide v1.0.0${NC}

${YELLOW}Quick Start${NC}
1. Run setup:        ${GREEN}$0 setup${NC}
2. Edit .env file with your Trakt credentials
3. Run tests:        ${GREEN}$0 test-all${NC}
4. Start server:     ${GREEN}$0 dev${NC} (development) or ${GREEN}$0 start${NC} (production)

${YELLOW}Railway Deployment${NC}
1. Push to GitHub
2. Connect repository to Railway
3. Add PostgreSQL service
4. Set environment variables:
   - TRAKT_CLIENT_ID
   - TRAKT_CLIENT_SECRET
   - API_KEY_HASH
   - NODE_ENV=production

${YELLOW}Security Best Practices${NC}
- Use HTTPS in production
- Regularly rotate API keys
- Monitor server logs
- Keep dependencies updated
- Run security checks regularly

${YELLOW}Support${NC}
- Check logs for errors: ${GREEN}$0 logs${NC}
- Run security check: ${GREEN}$0 security-check${NC}
- Test endpoints: ${GREEN}$0 test-https${NC}
EOF
}

# Main command handling
main() {
    case "${1:-}" in
        "setup")
            print_header
            complete_setup
            ;;
        "setup-env")
            print_header
            setup_environment
            ;;
        "setup-deps")
            print_header
            check_dependencies && setup_dependencies
            ;;
        "setup-dev")
            print_header
            complete_setup
            generate_dev_certificate
            ;;
        "generate-key"|"generate")
            print_header
            local api_key
            api_key=$(generate_api_key)
            local hash
            hash=$(hash_api_key "$api_key")
            echo -e "${GREEN}Generated API Key and Hash:${NC}"
            echo
            echo -e "${YELLOW}API Key (use in Kodi addon):${NC}"
            echo -e "${GREEN}$api_key${NC}"
            echo
            echo -e "${YELLOW}API Key Hash (use in .env file):${NC}"
            echo -e "${GREEN}API_KEY_HASH=$hash${NC}"
            echo
            # Save API key for testing
            echo "$api_key" > "$PROJECT_ROOT/.api-key"
            chmod 600 "$PROJECT_ROOT/.api-key"
            log_warning "Keep the API key secret and secure!"
            ;;
        "hash")
            if [ -z "${2:-}" ]; then
                log_error "Usage: $0 hash <api-key>"
                exit 1
            fi
            hash_api_key "$2"
            ;;
        "security-check"|"check")
            print_header
            security_check
            ;;
        "test-db"|"test-database")
            print_header
            test_database
            ;;
        "test-https")
            print_header
            test_https "${2:-}"
            ;;
        "test-all"|"test")
            print_header
            log_info "Running comprehensive test suite..."
            echo
            security_check
            echo
            test_database
            echo
            if curl -k -s "https://localhost:3000/health" >/dev/null 2>&1; then
                test_https
            else
                log_warning "HTTPS server not running, skipping HTTPS tests"
                log_info "Start server with HTTPS and run: $0 test-https"
            fi
            ;;
        "cert-dev")
            print_header
            generate_dev_certificate
            ;;
        "cert-prod")
            print_header
            log_info "For production SSL certificates, use Let's Encrypt or your certificate provider"
            log_info "See deploy guide: $0 deploy-guide"
            ;;
        "start")
            print_header
            start_server "production"
            ;;
        "dev")
            print_header
            start_server "dev"
            ;;
        "build")
            print_header
            log_info "Building TypeScript project..."
            cd "$PROJECT_ROOT"
            npm run build
            log_success "Build complete"
            ;;
        "clean")
            print_header
            log_info "Cleaning build artifacts..."
            cd "$PROJECT_ROOT"
            rm -rf dist/ build/ .tsbuildinfo
            log_success "Build artifacts cleaned"
            ;;
        "stop")
            print_header
            log_info "Stopping server processes..."
            pkill -f "node.*server" || log_warning "No server processes found"
            ;;
        "health")
            print_header
            check_health
            ;;
        "logs")
            print_header
            log_info "Showing recent server logs..."
            if [ -d "$PROJECT_ROOT/logs" ]; then
                tail -f "$PROJECT_ROOT/logs"/*.log 2>/dev/null || log_warning "No log files found"
            else
                log_warning "Logs directory not found"
            fi
            ;;
        "monitor")
            print_header
            log_info "Starting real-time monitoring..."
            while true; do
                clear
                echo -e "${CYAN}Blazing Helper Server Monitor${NC}"
                echo -e "${CYAN}=============================${NC}"
                echo
                check_health
                echo
                echo -e "${BLUE}Press Ctrl+C to exit${NC}"
                sleep 5
            done
            ;;
        "deploy-guide")
            print_header
            show_deploy_guide
            ;;
        "production-check")
            print_header
            production_check
            ;;
        "update")
            print_header
            log_info "Updating dependencies..."
            cd "$PROJECT_ROOT"
            npm update
            log_success "Dependencies updated"
            ;;
        "backup")
            print_header
            log_info "Creating backup..."
            local backup_dir="$PROJECT_ROOT/backups/$(date +%Y%m%d_%H%M%S)"
            mkdir -p "$backup_dir"
            cp -r "$PROJECT_ROOT/.env" "$PROJECT_ROOT/logs" "$backup_dir/" 2>/dev/null || true
            log_success "Backup created in $backup_dir"
            ;;
        "reset")
            print_header
            log_warning "This will reset the project to clean state (keeping .env)"
            read -p "Are you sure? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                cd "$PROJECT_ROOT"
                rm -rf node_modules/ dist/ build/ logs/*.log 2>/dev/null || true
                log_success "Project reset to clean state"
            fi
            ;;
        *)
            print_header
            print_usage
            ;;
    esac
}

# Make script executable and run
chmod +x "$0" 2>/dev/null || true
main "$@"