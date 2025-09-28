/**
 * PostgreSQL database adapter for Railway and production deployments
 * Uses pg library with connection pooling and robust error handling
 */

import { DatabaseAdapter, DatabaseStats, DatabaseConfig } from '../../types/database';
import { CachedToken } from '../../types/trakt';
import { LogEntry, RateLimitEntry } from '../../types/http';

interface Migration {
    name: string;
    sql: string;
}

export class PostgreSQLAdapter implements DatabaseAdapter {
    private config: DatabaseConfig;
    private pool: any; // pg.Pool instance
    private connected = false;

    constructor(config: DatabaseConfig) {
        this.config = config;
    }

    async connect(): Promise<void> {
        try {
            // Dynamic import for pg (optional dependency)
            const { Pool } = await import('pg');

            this.pool = new Pool({
                connectionString: this.config.connectionString,
                ssl: this.config.ssl ? {
                    rejectUnauthorized: false // Required for Railway/Heroku
                } : false,
                max: this.config.poolSize || 10,
                idleTimeoutMillis: this.config.idleTimeoutMs || 30000, // cspell:disable-line
                connectionTimeoutMillis: 5000, // cspell:disable-line
            });

            // Test connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();

            await this.createTables();
            await this.runMigrations();

            this.connected = true;
            console.log('🐘 PostgreSQL connected successfully');

        } catch (error) {
            console.error('❌ PostgreSQL connection failed:', error);
            throw new Error(`PostgreSQL connection failed: ${error}`);
        }
    }

    async disconnect(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.connected = false;
            console.log('🐘 PostgreSQL disconnected');
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            if (!this.connected || !this.pool) return false;

            const client = await this.pool.connect();
            const result = await client.query('SELECT 1 as test');
            client.release();

            return result.rows[0]?.test === 1;
        } catch {
            return false;
        }
    }

    private async createTables(): Promise<void> {
        const queries = [
            // Tokens table
            `CREATE TABLE IF NOT EXISTS tokens (
        key VARCHAR(255) PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at BIGINT NOT NULL,
        cached_at BIGINT NOT NULL,
        token_type VARCHAR(50),
        scope TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`,

            // Rate limits table
            `CREATE TABLE IF NOT EXISTS rate_limits (
        key VARCHAR(255) PRIMARY KEY,
        requests INTEGER NOT NULL,
        window_start BIGINT NOT NULL,
        last_request BIGINT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

            // Request logs table
            `CREATE TABLE IF NOT EXISTS request_logs (
        id SERIAL PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        ip VARCHAR(45) NOT NULL,
        method VARCHAR(10) NOT NULL,
        path TEXT NOT NULL,
        user_agent TEXT,
        success BOOLEAN NOT NULL,
        error TEXT,
        duration INTEGER,
        status_code INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )`,

            // Performance indexes
            `CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens(expires_at)`,
            `CREATE INDEX IF NOT EXISTS idx_tokens_cached_at ON tokens(cached_at)`,
            `CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start)`,
            `CREATE INDEX IF NOT EXISTS idx_rate_limits_updated_at ON rate_limits(updated_at)`,
            `CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp)`,
            `CREATE INDEX IF NOT EXISTS idx_request_logs_ip ON request_logs(ip)`,
            `CREATE INDEX IF NOT EXISTS idx_request_logs_path ON request_logs(path)`,
            `CREATE INDEX IF NOT EXISTS idx_request_logs_success ON request_logs(success)`,
            `CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at)`,
        ];

        for (const query of queries) {
            await this.pool.query(query);
        }
    }

    private async runMigrations(): Promise<void> {
        // Create migrations table if it doesn't exist
        await this.pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

        // Future migrations would be defined here
        const migrations: Migration[] = [
            // Example: { name: 'add_user_agent_index', sql: 'CREATE INDEX...' }
        ];

        for (const migration of migrations) {
            const existing = await this.pool.query(
                'SELECT 1 FROM migrations WHERE name = $1',
                [migration.name]
            );

            if (existing.rows.length === 0) {
                await this.pool.query(migration.sql);
                await this.pool.query(
                    'INSERT INTO migrations (name) VALUES ($1)',
                    [migration.name]
                );
                console.log(`✅ Applied migration: ${migration.name}`);
            }
        }
    }

    // Token operations
    async storeToken(key: string, token: CachedToken): Promise<void> {
        const query = `
      INSERT INTO tokens (key, access_token, refresh_token, expires_at, cached_at, token_type, scope)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (key) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        cached_at = EXCLUDED.cached_at,
        token_type = EXCLUDED.token_type,
        scope = EXCLUDED.scope
    `;

        await this.pool.query(query, [
            key,
            token.access_token,
            token.refresh_token || null,
            token.expires_at,
            token.cached_at,
            token.token_type || null,
            token.scope || null,
        ]);
    }

    async getToken(key: string): Promise<CachedToken | null> {
        const result = await this.pool.query(
            'SELECT * FROM tokens WHERE key = $1 AND expires_at > $2',
            [key, Date.now()]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            access_token: row.access_token,
            refresh_token: row.refresh_token,
            expires_at: parseInt(row.expires_at),
            cached_at: parseInt(row.cached_at),
            token_type: row.token_type,
            scope: row.scope,
            expires_in: Math.floor((parseInt(row.expires_at) - Date.now()) / 1000),
        };
    }

    async deleteToken(key: string): Promise<boolean> {
        const result = await this.pool.query('DELETE FROM tokens WHERE key = $1', [key]);
        return result.rowCount > 0;
    }

    async cleanupExpiredTokens(): Promise<number> {
        const result = await this.pool.query(
            'DELETE FROM tokens WHERE expires_at <= $1',
            [Date.now()]
        );
        return result.rowCount;
    }

    async getTokenCount(): Promise<number> {
        const result = await this.pool.query(
            'SELECT COUNT(*) as count FROM tokens WHERE expires_at > $1',
            [Date.now()]
        );
        return parseInt(result.rows[0].count);
    }

    // Rate limiting operations
    async getRateLimit(key: string): Promise<RateLimitEntry | null> {
        const result = await this.pool.query(
            'SELECT * FROM rate_limits WHERE key = $1',
            [key]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            requests: row.requests,
            windowStart: parseInt(row.window_start),
            lastRequest: parseInt(row.last_request),
        };
    }

    async setRateLimit(key: string, entry: RateLimitEntry): Promise<void> {
        const query = `
      INSERT INTO rate_limits (key, requests, window_start, last_request, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (key) DO UPDATE SET
        requests = EXCLUDED.requests,
        window_start = EXCLUDED.window_start,
        last_request = EXCLUDED.last_request,
        updated_at = NOW()
    `;

        await this.pool.query(query, [
            key,
            entry.requests,
            entry.windowStart,
            entry.lastRequest,
        ]);
    }

    async cleanupRateLimits(cutoff: number): Promise<number> {
        const result = await this.pool.query(
            'DELETE FROM rate_limits WHERE window_start < $1',
            [cutoff]
        );
        return result.rowCount;
    }

    async getRateLimitCount(): Promise<number> {
        const result = await this.pool.query('SELECT COUNT(*) as count FROM rate_limits');
        return parseInt(result.rows[0].count);
    }

    // Analytics operations
    async logRequest(entry: LogEntry): Promise<void> {
        const query = `
      INSERT INTO request_logs (timestamp, ip, method, path, user_agent, success, error, duration, status_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

        await this.pool.query(query, [
            entry.timestamp,
            entry.ip,
            entry.method,
            entry.path,
            entry.userAgent,
            entry.success,
            entry.error || null,
            entry.duration || null,
            entry.statusCode || null,
        ]);

        // Periodic cleanup (keep last 1M entries)
        if (Math.random() < 0.0001) { // 0.01% chance
            await this.pool.query(`
        DELETE FROM request_logs 
        WHERE id NOT IN (
          SELECT id FROM request_logs 
          ORDER BY timestamp DESC 
          LIMIT 1000000
        )
      `);
        }
    }

    async getStats(timeRange: number = 24 * 60 * 60 * 1000): Promise<DatabaseStats> {
        const cutoff = Date.now() - timeRange;

        const [
            totalResult,
            successResult,
            topEndpointsResult,
            uniqueIpsResult,
            avgTimeResult,
            tokenCountResult,
            rateLimitCountResult
        ] = await Promise.all([
            this.pool.query('SELECT COUNT(*) as count FROM request_logs WHERE timestamp > $1', [cutoff]),
            this.pool.query('SELECT COUNT(*) as count FROM request_logs WHERE timestamp > $1 AND success = true', [cutoff]),
            this.pool.query(`
        SELECT path, COUNT(*) as count 
        FROM request_logs 
        WHERE timestamp > $1 
        GROUP BY path 
        ORDER BY count DESC 
        LIMIT 10
      `, [cutoff]),
            this.pool.query('SELECT COUNT(DISTINCT ip) as count FROM request_logs WHERE timestamp > $1', [cutoff]),
            this.pool.query('SELECT AVG(duration) as avg_duration FROM request_logs WHERE timestamp > $1 AND duration IS NOT NULL', [cutoff]),
            this.pool.query('SELECT COUNT(*) as count FROM tokens WHERE expires_at > $1', [Date.now()]),
            this.pool.query('SELECT COUNT(*) as count FROM rate_limits'),
        ]);

        const totalRequests = parseInt(totalResult.rows[0].count);
        const successfulRequests = parseInt(successResult.rows[0].count);
        const uniqueIps = parseInt(uniqueIpsResult.rows[0].count);
        const averageResponseTime = Math.round(parseFloat(avgTimeResult.rows[0].avg_duration) || 0);
        const tokensCached = parseInt(tokenCountResult.rows[0].count);
        const rateLimitEntries = parseInt(rateLimitCountResult.rows[0].count);

        const topEndpoints = topEndpointsResult.rows.map((row: any) => ({
            path: row.path,
            count: parseInt(row.count),
        }));

        // Simple cache hit rate calculation
        const cacheHitRate = totalRequests > 0 ? (tokensCached / totalRequests) * 100 : 0;

        return {
            totalRequests,
            successfulRequests,
            errorRequests: totalRequests - successfulRequests,
            uniqueIps,
            topEndpoints,
            cacheHitRate: Math.min(100, cacheHitRate),
            averageResponseTime,
            tokensCached,
            rateLimitEntries,
        };
    }

    async getRecentErrors(limit: number = 10): Promise<LogEntry[]> {
        const result = await this.pool.query(`
      SELECT * FROM request_logs 
      WHERE success = false 
      ORDER BY timestamp DESC 
      LIMIT $1
    `, [limit]);

        return result.rows.map((row: any) => ({
            timestamp: parseInt(row.timestamp),
            ip: row.ip,
            method: row.method,
            path: row.path,
            userAgent: row.user_agent,
            success: false,
            error: row.error,
            duration: row.duration,
            statusCode: row.status_code,
        }));
    }

    async getSize(): Promise<number> {
        const result = await this.pool.query(`
      SELECT pg_total_relation_size('tokens') + 
             pg_total_relation_size('rate_limits') + 
             pg_total_relation_size('request_logs') as total_size
    `);
        return parseInt(result.rows[0].total_size);
    }

    // PostgreSQL-specific operations
    async analyze(): Promise<void> {
        await this.pool.query('ANALYZE');
    }

    async getConnectionCount(): Promise<number> {
        const result = await this.pool.query(`
      SELECT count(*) as connections 
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `); // cspell:disable-line
        return parseInt(result.rows[0].connections);
    }
}