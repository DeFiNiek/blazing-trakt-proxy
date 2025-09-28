/**
 * Database configuration loader with automatic Railway/platform detection
 */

import { DatabaseConfig } from '../types/database';

export class DatabaseConfigLoader {
    /**
     * Load database configuration with automatic platform detection
     */
    public static loadDatabaseConfig(): DatabaseConfig {
        // Check for explicit database type override
        const explicitType = process.env.DATABASE_TYPE?.toLowerCase();

        if (explicitType === 'memory') {
            console.log('🧠 Using in-memory storage (explicitly configured)');
            return { type: 'memory' };
        }

        if (explicitType === 'sqlite') {
            console.log('💾 Using SQLite database (explicitly configured)');
            return {
                type: 'sqlite',
                filename: process.env.SQLITE_FILENAME || 'trakt-proxy.db',
                migrations: true,
            };
        }

        // Auto-detect Railway PostgreSQL
        const railwayPostgres = process.env.DATABASE_URL ||
            process.env.POSTGRES_URL ||
            process.env.POSTGRESQL_URL;

        if (railwayPostgres) {
            console.log('🐘 Detected Railway/Cloud PostgreSQL - using persistent database');
            return {
                type: 'postgresql',
                connectionString: railwayPostgres,
                ssl: this.shouldUseSsl(),
                poolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
                maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
                idleTimeoutMs: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
                migrations: true,
            };
        }

        // Check for local PostgreSQL development setup
        if (process.env.POSTGRES_HOST || process.env.DB_HOST) {
            const host = process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost';
            const port = process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';
            const database = process.env.POSTGRES_DB || process.env.DB_NAME || 'trakt_proxy';
            const username = process.env.POSTGRES_USER || process.env.DB_USER || 'postgres';
            const password = process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || '';

            const connectionString = `postgresql://${username}:${password}@${host}:${port}/${database}`;

            console.log('🐘 Using local PostgreSQL development setup');
            return {
                type: 'postgresql',
                connectionString,
                ssl: false,
                poolSize: parseInt(process.env.DB_POOL_SIZE || '5'),
                migrations: true,
            };
        }

        // Force memory for testing
        if (process.env.NODE_ENV === 'test') {
            console.log('🧪 Using in-memory database for testing');
            return { type: 'memory' };
        }

        // Development fallback to SQLite
        if (process.env.NODE_ENV === 'development') {
            console.log('💾 Development mode - using SQLite for persistence');
            return {
                type: 'sqlite',
                filename: 'trakt-proxy-dev.db',
                migrations: true,
            };
        }

        // Production fallback warning
        console.log('⚠️  No database configured in production, using in-memory storage');
        console.log('💡 For persistence on Railway: Add PostgreSQL service');
        console.log('💡 For local development: Set DATABASE_TYPE=sqlite');

        return { type: 'memory' };
    }

    /**
     * Determine if SSL should be used for database connections
     */
    private static shouldUseSsl(): boolean {
        // Explicit SSL configuration
        if (process.env.DB_SSL !== undefined) {
            return process.env.DB_SSL === 'true';
        }

        // Railway and most cloud providers require SSL in production
        if (process.env.RAILWAY_ENVIRONMENT ||
            process.env.NODE_ENV === 'production') {
            return true;
        }

        // Check if connection string indicates SSL requirement
        const connectionString = process.env.DATABASE_URL;
        if (connectionString?.includes('sslmode=require') ||
            connectionString?.includes('ssl=true')) {
            return true;
        }

        return false;
    }

    /**
     * Validate database configuration
     */
    public static validateDatabaseConfig(config: DatabaseConfig): {
        valid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        switch (config.type) {
            case 'postgresql':
                if (!config.connectionString) {
                    errors.push('PostgreSQL connection string is required');
                }

                if (config.poolSize && config.poolSize > 50) {
                    warnings.push('High pool size may impact performance');
                }

                if (!config.ssl && process.env.NODE_ENV === 'production') {
                    warnings.push('SSL disabled in production environment');
                }
                break;

            case 'sqlite':
                if (!config.filename) {
                    warnings.push('SQLite filename not specified, using default');
                }

                if (process.env.NODE_ENV === 'production') {
                    warnings.push('SQLite may not be suitable for high-traffic production use');
                }
                break;

            case 'memory':
                if (process.env.NODE_ENV === 'production') {
                    warnings.push('In-memory storage will lose data on restart');
                }
                break;
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Get database configuration summary for logging
     */
    public static getConfigSummary(config: DatabaseConfig): string {
        switch (config.type) {
            case 'postgresql':
                const host = config.connectionString?.match(/@([^:]+)/)?.[1] || 'unknown';
                return `PostgreSQL (${host}) - Pool: ${config.poolSize}, SSL: ${config.ssl}`;

            case 'sqlite':
                return `SQLite (${config.filename})`;

            case 'memory':
                return 'In-Memory Storage';

            default:
                return 'Unknown Database Type';
        }
    }
}