/**
 * Database manager - factory pattern for creating and managing database adapters
 */

import { DatabaseConfig, DatabaseAdapter } from '../../types/database';
import { MemoryAdapter } from './memory-adapter';
import { SQLiteAdapter } from './sqlite-adapter';
import { PostgreSQLAdapter } from './postgresql-adapter';

export class DatabaseManager {
    private adapter: DatabaseAdapter;
    private config: DatabaseConfig;
    private healthCheckInterval: NodeJS.Timeout | undefined; // FIXED: Changed from ?:

    constructor(config: DatabaseConfig) {
        this.config = config;
        this.adapter = this.createAdapter(config);
    }

    /**
     * Factory method to create the appropriate database adapter
     */
    private createAdapter(config: DatabaseConfig): DatabaseAdapter {
        switch (config.type) {
            case 'postgresql':
                console.log('🐘 Creating PostgreSQL adapter');
                return new PostgreSQLAdapter(config);

            case 'sqlite':
                console.log('💾 Creating SQLite adapter');
                return new SQLiteAdapter(config);

            case 'memory':
            default:
                console.log('🧠 Creating Memory adapter');
                return new MemoryAdapter();
        }
    }

    /**
     * Initialize the database connection
     */
    public async initialize(): Promise<void> {
        try {
            await this.adapter.connect();

            // Start health monitoring for persistent databases
            if (this.config.type !== 'memory') {
                this.startHealthMonitoring();
            }

            console.log(`✅ Database initialized: ${this.config.type}`);
        } catch (error) {
            console.error(`❌ Database initialization failed: ${error}`);
            throw error;
        }
    }

    /**
     * Get the database adapter instance
     */
    public getAdapter(): DatabaseAdapter {
        return this.adapter;
    }

    /**
     * Get database configuration
     */
    public getConfig(): DatabaseConfig {
        return this.config;
    }

    /**
     * Check database health
     */
    public async isHealthy(): Promise<boolean> {
        try {
            return await this.adapter.healthCheck();
        } catch {
            return false;
        }
    }

    /**
     * Get database statistics
     */
    public async getStats(timeRange?: number) {
        return await this.adapter.getStats(timeRange);
    }

    /**
     * Perform database maintenance
     */
    public async performMaintenance(): Promise<{
        tokensCleanedUp: number;
        rateLimitsCleanedUp: number;
        maintenanceActions: string[];
    }> {
        const actions: string[] = [];

        // Cleanup expired tokens
        const tokensCleanedUp = await this.adapter.cleanupExpiredTokens();
        if (tokensCleanedUp > 0) {
            actions.push(`Cleaned up ${tokensCleanedUp} expired tokens`);
        }

        // Cleanup old rate limits (older than 24 hours)
        const cutoff = Date.now() - (24 * 60 * 60 * 1000);
        const rateLimitsCleanedUp = await this.adapter.cleanupRateLimits(cutoff);
        if (rateLimitsCleanedUp > 0) {
            actions.push(`Cleaned up ${rateLimitsCleanedUp} old rate limit entries`);
        }

        // Adapter-specific maintenance
        if ('vacuum' in this.adapter && typeof this.adapter.vacuum === 'function') {
            await this.adapter.vacuum();
            actions.push('Performed database vacuum');
        }

        if ('analyze' in this.adapter && typeof this.adapter.analyze === 'function') {
            await this.adapter.analyze();
            actions.push('Updated database statistics');
        }

        return {
            tokensCleanedUp,
            rateLimitsCleanedUp,
            maintenanceActions: actions,
        };
    }

    /**
     * Start periodic health monitoring
     */
    private startHealthMonitoring(): void {
        this.healthCheckInterval = setInterval(async () => {
            try {
                const isHealthy = await this.isHealthy();
                if (!isHealthy) {
                    console.warn('⚠️ Database health check failed');
                }
            } catch (error) {
                console.error('❌ Database health check error:', error);
            }
        }, 60000); // Check every minute
    }

    /**
     * Gracefully shutdown the database connection
     */
    public async cleanup(): Promise<void> {
        try {
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = undefined;
            }

            await this.adapter.disconnect();
            console.log('✅ Database cleanup completed');
        } catch (error) {
            console.error('❌ Database cleanup error:', error);
        }
    }

    /**
     * Create a backup (if supported by adapter)
     */
    public async backup(destination?: string): Promise<string | null> {
        if ('backup' in this.adapter && typeof this.adapter.backup === 'function') {
            const backupPath = destination || `backup-${Date.now()}.db`;
            await this.adapter.backup(backupPath);
            return backupPath;
        }

        return null;
    }

    /**
     * Get detailed database information
     */
    public async getDatabaseInfo(): Promise<{
        type: string;
        connected: boolean;
        healthy: boolean;
        size: number;
        stats: any;
        config: any;
    }> {
        const [healthy, size, stats] = await Promise.all([
            this.isHealthy(),
            this.adapter.getSize?.() || Promise.resolve(0),
            this.getStats(),
        ]);

        // Sanitize config for public display
        const sanitizedConfig = {
            type: this.config.type,
            poolSize: this.config.poolSize,
            ssl: this.config.ssl,
            migrations: this.config.migrations,
            // Don't expose connection strings or sensitive data
        };

        return {
            type: this.config.type,
            connected: true, // If we got this far, we're connected
            healthy,
            size,
            stats,
            config: sanitizedConfig,
        };
    }

    /**
     * Test database performance
     */
    public async performanceTest(): Promise<{
        writeTime: number;
        readTime: number;
        deleteTime: number;
        operations: number;
    }> {
        const testKey = `test-${Date.now()}`;
        const testToken = {
            access_token: 'test-token',
            refresh_token: 'test-refresh',
            expires_at: Date.now() + 3600000,
            cached_at: Date.now(),
            token_type: 'Bearer',
            scope: 'public',
            expires_in: 3600,
        };

        const operations = 100;

        // Write test
        const writeStart = Date.now();
        for (let i = 0; i < operations; i++) {
            await this.adapter.storeToken(`${testKey}-${i}`, testToken);
        }
        const writeTime = Date.now() - writeStart;

        // Read test
        const readStart = Date.now();
        for (let i = 0; i < operations; i++) {
            await this.adapter.getToken(`${testKey}-${i}`);
        }
        const readTime = Date.now() - readStart;

        // Delete test
        const deleteStart = Date.now();
        for (let i = 0; i < operations; i++) {
            await this.adapter.deleteToken(`${testKey}-${i}`);
        }
        const deleteTime = Date.now() - deleteStart;

        return {
            writeTime,
            readTime,
            deleteTime,
            operations,
        };
    }

    /**
     * Migration helper - migrate from memory to persistent storage
     */
    public static async migrateFromMemory(
        _memoryAdapter: MemoryAdapter, // FIXED: Added underscore prefix
        _targetManager: DatabaseManager // FIXED: Added underscore prefix
    ): Promise<{ tokensMigrated: number; rateLimitsMigrated: number }> {
        // This would require access to memory adapter's internal data
        // Implementation would depend on exposing migration methods

        console.log('🔄 Memory to persistent database migration not yet implemented');
        return { tokensMigrated: 0, rateLimitsMigrated: 0 };
    }
}