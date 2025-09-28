/**
 * Configuration type definitions
 */

export interface ServerConfig {
    readonly port: number;
    readonly host: string;
    readonly environment: 'development' | 'production';
    readonly enableHttps: boolean;
    // Fix: Make these properly optional with undefined union
    readonly httpsKeyPath?: string | undefined;
    readonly httpsCertPath?: string | undefined;
    readonly maxRequestBodySize: number;
    readonly enableDetailedLogging: boolean;
}

export interface TraktConfig {
    readonly clientId: string;
    readonly clientSecret: string;
}

export interface SecurityConfig {
    readonly apiKeyHash: string;
    readonly allowedOrigins: string[];
    readonly rateLimitWindowMs: number;
    readonly rateLimitMaxRequests: number;
    readonly tokenCacheTtl: number;
}

export interface LoggingConfig {
    readonly enableDetailedLogging: boolean;
    readonly logDirectory: string;
    readonly maxLogFiles: number;
    readonly maxLogAge: string;
}

export interface DatabaseConfig {
    readonly type: 'memory' | 'sqlite' | 'postgresql';
    readonly connectionString?: string;
    readonly filename?: string;
    readonly poolSize?: number;
    readonly ssl?: boolean;
    readonly migrations?: boolean;
    readonly maxConnections?: number;
    readonly idleTimeoutMs?: number;
}

export interface ApplicationConfig {
    readonly server: ServerConfig;
    readonly trakt: TraktConfig;
    readonly security: SecurityConfig;
    readonly logging: LoggingConfig;
    readonly database: DatabaseConfig;
}

export interface EnvVariables {
    readonly PORT?: string;
    readonly HOST?: string;
    readonly NODE_ENV?: string;
    readonly TRAKT_CLIENT_ID?: string;
    readonly TRAKT_CLIENT_SECRET?: string;
    readonly API_KEY_HASH?: string;
    readonly ALLOWED_ORIGINS?: string;
    readonly RATE_LIMIT_WINDOW_MS?: string;
    readonly RATE_LIMIT_MAX_REQUESTS?: string;
    readonly ENABLE_HTTPS?: string;
    readonly HTTPS_KEY_PATH?: string;
    readonly HTTPS_CERT_PATH?: string;
    readonly MAX_REQUEST_BODY_SIZE?: string;
    readonly ENABLE_DETAILED_LOGGING?: string;
    readonly TOKEN_CACHE_TTL?: string;

    // Database configuration
    readonly DATABASE_TYPE?: string;
    readonly DATABASE_URL?: string;
    readonly POSTGRES_URL?: string;
    readonly POSTGRESQL_URL?: string;
    readonly POSTGRES_HOST?: string;
    readonly POSTGRES_PORT?: string;
    readonly POSTGRES_DB?: string;
    readonly POSTGRES_USER?: string;
    readonly POSTGRES_PASSWORD?: string;
    readonly DB_HOST?: string;
    readonly DB_PORT?: string;
    readonly DB_NAME?: string;
    readonly DB_USER?: string;
    readonly DB_PASSWORD?: string;
    readonly DB_SSL?: string;
    readonly DB_POOL_SIZE?: string;
    readonly DB_MAX_CONNECTIONS?: string;
    readonly DB_IDLE_TIMEOUT?: string;
    readonly SQLITE_FILENAME?: string;
}