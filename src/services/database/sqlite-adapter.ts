/**
 * SQLite database adapter for local development and simple deployments
 * Uses better-sqlite3 for synchronous operations with async wrappers
 */

import { DatabaseAdapter, DatabaseStats, DatabaseConfig } from '../../types/database';
import { CachedToken } from '../../types/trakt';
import { LogEntry, RateLimitEntry } from '../../types/http';
import * as fs from 'fs';
import * as path from 'path';

type Database = any; // Type for better-sqlite3 Database instance
type Statement = any; // Type for better-sqlite3 Statement instance

export class SQLiteAdapter implements DatabaseAdapter {
    private config: DatabaseConfig;
    private db: Database | null = null; // FIXED: Initialize as null
    private connected = false;

    constructor(config: DatabaseConfig) {
        this.config = config;
    }

    async connect(): Promise<void> {
        try {
            // Dynamic import for better-sqlite3 (optional dependency)
            let Database: any;
            try {
                // Try different import methods
                try {
                    Database = (await import('better-sqlite3')).default;
                } catch (importError) {
                    // Fallback to require for CommonJS compatibility
                    Database = require('better-sqlite3');
                }

                if (!Database) {
                    throw new Error('Database constructor not found');
                }
            } catch (error) {
                console.warn(`⚠️ better-sqlite3 not available: ${error}`);
                throw new Error('better-sqlite3 is not installed or not accessible. Run: npm install better-sqlite3');
            }

            // Ensure directory exists
            const dbPath = this.config.filename || 'trakt-proxy.db';
            const dbDir = path.dirname(path.resolve(dbPath));
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            console.log(`💾 Creating SQLite database at: ${dbPath}`);
            this.db = new Database(dbPath);

            // FIXED: Check if db was created successfully
            if (!this.db) {
                throw new Error('Failed to create SQLite database instance');
            }

            this.db.pragma('journal_mode = WAL'); // Better performance
            this.db.pragma('synchronous = NORMAL'); // Good balance of safety/performance
            this.db.pragma('cache_size = 10000'); // 10MB cache

            await this.createTables();
            await this.runMigrations();

            this.connected = true;
            console.log(`💾 SQLite connected: ${dbPath}`);

        } catch (error) {
            console.error('❌ SQLite connection failed:', error);
            this.db = null; // FIXED: Ensure db is null on failure
            this.connected = false;
            throw new Error(`SQLite connection failed: ${error}`);
        }
    }

    async disconnect(): Promise<void> {
        if (this.db) {
            this.db.close();
            this.db = null; // FIXED: Set to null after closing
            this.connected = false;
            console.log('💾 SQLite disconnected');
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            if (!this.connected || !this.db) return false;

            // Simple query to test connection
            const result = this.db.prepare('SELECT 1 as test').get();
            return result?.test === 1;
        } catch {
            return false;
        }
    }

    // FIXED: Add connection check helper
    private ensureConnected(): void {
        if (!this.db || !this.connected) {
            throw new Error('SQLite database not connected');
        }
    }

    private async createTables(): Promise<void> {
        // FIXED: Check connection before creating tables
        this.ensureConnected();

        const tables = [
            `CREATE TABLE IF NOT EXISTS tokens (
        key TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at INTEGER NOT NULL,
        cached_at INTEGER NOT NULL,
        token_type TEXT,
        scope TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )`,

            `CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        requests INTEGER NOT NULL,
        window_start INTEGER NOT NULL,
        last_request INTEGER NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )`,

            `CREATE TABLE IF NOT EXISTS request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, /* cSpell:disable-line */
        timestamp INTEGER NOT NULL,
        ip TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        user_agent TEXT,
        success INTEGER NOT NULL,
        error TEXT,
        duration INTEGER,
        status_code INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )`,

            // Indexes for performance
            `CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens(expires_at)`,
            `CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start)`,
            `CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp)`,
            `CREATE INDEX IF NOT EXISTS idx_request_logs_ip ON request_logs(ip)`,
            `CREATE INDEX IF NOT EXISTS idx_request_logs_path ON request_logs(path)`,
            `CREATE INDEX IF NOT EXISTS idx_request_logs_success ON request_logs(success)`,
        ];

        for (const sql of tables) {
            this.db!.exec(sql);
        }
    }

    private async runMigrations(): Promise<void> {
        // Future migrations would go here
        // For now, just ensure schema is current
    }

    // Token operations
    async storeToken(key: string, token: CachedToken): Promise<void> {
        this.ensureConnected(); // FIXED: Check connection

        const stmt: Statement = this.db!.prepare(`
      INSERT OR REPLACE INTO tokens 
      (key, access_token, refresh_token, expires_at, cached_at, token_type, scope)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(
            key,
            token.access_token,
            token.refresh_token || null,
            token.expires_at,
            token.cached_at,
            token.token_type || null,
            token.scope || null
        );
    }

    async getToken(key: string): Promise<CachedToken | null> {
        this.ensureConnected(); // FIXED: Check connection

        const stmt: Statement = this.db!.prepare(`
      SELECT * FROM tokens 
      WHERE key = ? AND expires_at > ?
    `);

        const row: any = stmt.get(key, Date.now());
        if (!row) return null;

        return {
            access_token: row.access_token,
            refresh_token: row.refresh_token,
            expires_at: row.expires_at,
            cached_at: row.cached_at,
            token_type: row.token_type,
            scope: row.scope,
            expires_in: Math.floor((row.expires_at - Date.now()) / 1000),
        };
    }

    async deleteToken(key: string): Promise<boolean> {
        this.ensureConnected(); // FIXED: Check connection

        const stmt: Statement = this.db!.prepare('DELETE FROM tokens WHERE key = ?');
        const result = stmt.run(key);
        return result.changes > 0;
    }

    async cleanupExpiredTokens(): Promise<number> {
        this.ensureConnected(); // FIXED: Check connection

        const stmt: Statement = this.db!.prepare('DELETE FROM tokens WHERE expires_at <= ?');
        const result = stmt.run(Date.now());
        return result.changes;
    }

    async getTokenCount(): Promise<number> {
        this.ensureConnected(); // FIXED: Check connection

        const stmt: Statement = this.db!.prepare('SELECT COUNT(*) as count FROM tokens WHERE expires_at > ?');
        const result = stmt.get(Date.now());
        return result.count;
    }

    // Rate limiting operations
    async getRateLimit(key: string): Promise<RateLimitEntry | null> {
        this.ensureConnected(); // FIXED: Check connection

        const stmt: Statement = this.db!.prepare('SELECT * FROM rate_limits WHERE key = ?');
        const row: any = stmt.get(key);

        if (!row) return null;

        return {
            requests: row.requests,
            windowStart: row.window_start,
            lastRequest: row.last_request,
        };
    }

    async setRateLimit(key: string, entry: RateLimitEntry): Promise<void> {
        this.ensureConnected(); // FIXED: Check connection

        const stmt: Statement = this.db!.prepare(`
      INSERT OR REPLACE INTO rate_limits 
      (key, requests, window_start, last_request, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

        stmt.run(
            key,
            entry.requests,
            entry.windowStart,
            entry.lastRequest,
            Date.now()
        );
    }

    async cleanupRateLimits(cutoff: number): Promise<number> {
        this.ensureConnected(); // FIXED: Check connection

        const stmt: Statement = this.db!.prepare('DELETE FROM rate_limits WHERE window_start < ?');
        const result = stmt.run(cutoff);
        return result.changes;
    }

    async getRateLimitCount(): Promise<number> {
        this.ensureConnected(); // FIXED: Check connection

        const stmt: Statement = this.db!.prepare('SELECT COUNT(*) as count FROM rate_limits');
        const result = stmt.get();
        return result.count;
    }

    // Analytics operations
    async logRequest(entry: LogEntry): Promise<void> {
        this.ensureConnected(); // FIXED: Check connection

        const stmt: Statement = this.db!.prepare(`
      INSERT INTO request_logs 
      (timestamp, ip, method, path, user_agent, success, error, duration, status_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(
            entry.timestamp,
            entry.ip,
            entry.method,
            entry.path,
            entry.userAgent,
            entry.success ? 1 : 0,
            entry.error || null,
            entry.duration || null,
            entry.statusCode || null
        );

        // Cleanup old logs periodically (keep last 100k entries)
        if (Math.random() < 0.001) { // 0.1% chance
            const cleanupStmt: Statement = this.db!.prepare(`
        DELETE FROM request_logs 
        WHERE id NOT IN (
          SELECT id FROM request_logs 
          ORDER BY timestamp DESC 
          LIMIT 100000
        )
      `);
            cleanupStmt.run();
        }
    }

    async getStats(timeRange: number = 24 * 60 * 60 * 1000): Promise<DatabaseStats> {
        this.ensureConnected(); // FIXED: Check connection

        const cutoff = Date.now() - timeRange;

        // Total requests
        const totalStmt: Statement = this.db!.prepare('SELECT COUNT(*) as count FROM request_logs WHERE timestamp > ?');
        const totalResult = totalStmt.get(cutoff);
        const totalRequests = totalResult.count;

        // Successful requests
        const successStmt: Statement = this.db!.prepare('SELECT COUNT(*) as count FROM request_logs WHERE timestamp > ? AND success = 1');
        const successResult = successStmt.get(cutoff);
        const successfulRequests = successResult.count;

        // Unique IPs
        const uniqueIpStmt: Statement = this.db!.prepare('SELECT COUNT(DISTINCT ip) as count FROM request_logs WHERE timestamp > ?');
        const uniqueIpResult = uniqueIpStmt.get(cutoff);
        const uniqueIps = uniqueIpResult.count;

        // Top endpoints
        const topEndpointsStmt: Statement = this.db!.prepare(`
      SELECT path, COUNT(*) as count 
      FROM request_logs 
      WHERE timestamp > ? 
      GROUP BY path 
      ORDER BY count DESC 
      LIMIT 10
    `);
        const topEndpoints = topEndpointsStmt.all(cutoff).map((row: any) => ({
            path: row.path,
            count: row.count,
        }));

        // Average response time
        const avgTimeStmt: Statement = this.db!.prepare(`
      SELECT AVG(duration) as avg_duration 
      FROM request_logs 
      WHERE timestamp > ? AND duration IS NOT NULL
    `);
        const avgTimeResult = avgTimeStmt.get(cutoff);
        const averageResponseTime = Math.round(avgTimeResult.avg_duration || 0);

        // Cache stats
        const tokenCountStmt: Statement = this.db!.prepare('SELECT COUNT(*) as count FROM tokens WHERE expires_at > ?');
        const tokenCountResult = tokenCountStmt.get(Date.now());
        const tokensCached = tokenCountResult.count;

        const rateLimitCountStmt: Statement = this.db!.prepare('SELECT COUNT(*) as count FROM rate_limits');
        const rateLimitCountResult = rateLimitCountStmt.get();
        const rateLimitEntries = rateLimitCountResult.count;

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
        this.ensureConnected(); // FIXED: Check connection

        const stmt: Statement = this.db!.prepare(`
      SELECT * FROM request_logs 
      WHERE success = 0 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);

        const rows = stmt.all(limit);
        return rows.map((row: any) => ({
            timestamp: row.timestamp,
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

    // SQLite-specific operations
    async vacuum(): Promise<void> {
        this.ensureConnected(); // FIXED: Check connection
        this.db!.exec('VACUUM');
    }

    async getSize(): Promise<number> {
        this.ensureConnected(); // FIXED: Check connection

        const stmt: Statement = this.db!.prepare(`
      SELECT page_count * page_size as size 
      FROM pragma_page_count(), pragma_page_size()
    `);
        const result = stmt.get();
        return result.size;
    }

    async backup(destination: string): Promise<void> {
        // Ensure destination directory exists
        const destDir = path.dirname(destination);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Simple file copy backup
        const sourcePath = this.config.filename || 'trakt-proxy.db';
        fs.copyFileSync(sourcePath, destination);
    }
}