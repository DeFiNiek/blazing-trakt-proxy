/**
 * Health and status controller with database support for monitoring and diagnostics
 */

import { RequestContext, ResponseContext } from '../types/http';
import { ApplicationConfig } from '../types/config';
import { LoggingService } from '../services/logging-service';
import { RateLimitService } from '../services/ratelimit-service';
import { TokenCacheService } from '../services/token-cache-service';
import { TraktService } from '../services/trakt-service';
import { DatabaseManager } from '../services/database';
import { BaseController } from './base-controller';

export class HealthController extends BaseController {
    private config: ApplicationConfig;
    private rateLimitService: RateLimitService;
    private tokenCacheService: TokenCacheService;
    private traktService: TraktService;
    private databaseManager: DatabaseManager | undefined;

    constructor(
        config: ApplicationConfig,
        logger: LoggingService,
        rateLimitService: RateLimitService,
        tokenCacheService: TokenCacheService,
        traktService: TraktService,
        databaseManager: DatabaseManager | undefined
    ) {
        super(logger);
        this.config = config;
        this.rateLimitService = rateLimitService;
        this.tokenCacheService = tokenCacheService;
        this.traktService = traktService;
        this.databaseManager = databaseManager;
    }

    public async handle(context: RequestContext): Promise<ResponseContext> {
        const { path, method } = context;

        try {
            switch (true) {
                case method === 'GET' && path === '/health':
                    return await this.getBasicHealth(context);

                case method === 'GET' && path === '/metrics':
                    return await this.getMetrics(context);

                case method === 'GET' && path === '/diagnostics':
                    return await this.getDiagnostics(context);

                default:
                    return this.createErrorResponse(404, 'Endpoint not found');
            }
        } catch (error) {
            this.logger.log(`❌ HealthController error: ${error}`, 'error');
            return this.createErrorResponse(500, 'Internal server error');
        }
    }

    private async getBasicHealth(context: RequestContext): Promise<ResponseContext> {
        this.logAction('getBasicHealth', context);

        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        const logs = this.logger.getRequestLogs();

        // Get database health if available
        let databaseHealth = { connected: false, type: 'memory' };
        if (this.databaseManager) {
            try {
                const isHealthy = await this.databaseManager.isHealthy();
                databaseHealth = {
                    connected: isHealthy,
                    type: this.databaseManager.getConfig().type,
                };
            } catch (error) {
                this.logger.log(`⚠️ Database health check failed: ${error}`, 'warn');
            }
        }

        const health = {
            status: 'healthy',
            timestamp: Date.now(),
            uptime: Math.floor(uptime),
            version: '2.1.0',
            environment: this.config.server.environment,
            memory: {
                used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            },
            requests_handled: logs.length,
            cache: {
                tokens: this.tokenCacheService.getCacheSize(),
                rate_limits: this.rateLimitService.getStoreSize(),
            },
            database: databaseHealth,
        };

        // Cache for 30 seconds
        return this.createCachedResponse(health, 30);
    }

    private async getMetrics(context: RequestContext): Promise<ResponseContext> {
        this.logAction('getMetrics', context);

        const logStats = this.logger.getLogStats();
        const cacheStats = this.tokenCacheService.getCacheStats();
        const rateLimitStats = this.rateLimitService.getStats();
        const memUsage = process.memoryUsage();

        // Get database stats if available
        let databaseStats = null;
        if (this.databaseManager) {
            try {
                databaseStats = await this.databaseManager.getStats();
            } catch (error) {
                this.logger.log(`⚠️ Database stats error: ${error}`, 'warn');
            }
        }

        const metrics = {
            timestamp: Date.now(),
            uptime_seconds: Math.floor(process.uptime()),

            requests: {
                total: logStats.totalRequests,
                successful: logStats.successfulRequests,
                failed: logStats.errorRequests,
                rate_per_minute: logStats.requestsPerMinute,
                avg_response_time_ms: logStats.averageResponseTime,
            },

            memory: {
                heap_used_bytes: memUsage.heapUsed,
                heap_total_bytes: memUsage.heapTotal,
                external_bytes: memUsage.external,
                rss_bytes: memUsage.rss,
                usage_ratio: memUsage.heapUsed / memUsage.heapTotal,
            },

            cache: {
                token_count: cacheStats.size,
                token_hit_rate: cacheStats.hitRate,
                valid_tokens: cacheStats.validTokens,
                expired_tokens: cacheStats.expired,
                cache_type: cacheStats.type,
            },

            rate_limiting: {
                active_entries: rateLimitStats.totalEntries,
                blocked_ips: rateLimitStats.blockedIps,
                active_windows: rateLimitStats.activeWindows,
                avg_requests_per_ip: rateLimitStats.averageRequestsPerIp,
                storage_type: rateLimitStats.storageType,
            },

            database: databaseStats,
        };

        return this.createCachedResponse(metrics, 15); // Cache for 15 seconds
    }

    private async getDiagnostics(context: RequestContext): Promise<ResponseContext> {
        this.logAction('getDiagnostics', context);

        const traktConnection = await this.testTraktConnection();
        const traktApiStatus = await this.traktService.getApiStatus();

        // Get database information if available
        let databaseInfo: {
            type: string;
            connected: boolean;
            healthy: boolean;
            message?: string;
            error?: string;
        } = {
            type: 'memory',
            connected: false,
            healthy: true,
            message: 'Using in-memory storage'
        };

        if (this.databaseManager) {
            try {
                const dbInfo = await this.databaseManager.getDatabaseInfo();
                databaseInfo = {
                    type: dbInfo.type,
                    connected: dbInfo.connected,
                    healthy: dbInfo.healthy,
                    message: `Database connected: ${dbInfo.type}`
                };
            } catch (error) {
                databaseInfo = {
                    type: this.config.database.type,
                    connected: false,
                    healthy: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        }

        return this.createNoCacheResponse({
            timestamp: Date.now(),

            configuration: {
                environment: this.config.server.environment,
                port: this.config.server.port,
                host: this.config.server.host,
                https_enabled: this.config.server.enableHttps,
                detailed_logging: this.config.logging.enableDetailedLogging,
                allowed_origins: this.config.security.allowedOrigins,
                rate_limit: {
                    window_ms: this.config.security.rateLimitWindowMs,
                    max_requests: this.config.security.rateLimitMaxRequests,
                },
                database: {
                    type: this.config.database?.type || 'memory',
                    ssl: this.config.database?.ssl || false,
                    poolSize: this.config.database?.poolSize || 0,
                },
            },

            services: {
                trakt_api: {
                    ...traktConnection,
                    ...traktApiStatus,
                    client_id: this.traktService.getApiInfo().clientId,
                },
                token_cache: this.tokenCacheService.getCacheStats(),
                rate_limiting: this.rateLimitService.getStats(),
                logging: this.logger.getLogStats(),
                database: databaseInfo,
            },

            performance: {
                uptime_seconds: Math.floor(process.uptime()),
                memory: process.memoryUsage(),
                cpu_usage: this.getCpuUsage(),
                load_average: this.getLoadAverage(),
            },

            health_checks: {
                trakt_connectivity: traktConnection.connected,
                memory_usage_ok: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) < 0.9,
                error_rate_ok: parseFloat(this.logger.getLogStats().errorRate) < 10,
                response_time_ok: this.logger.getLogStats().averageResponseTime < 1000,
                database_healthy: databaseInfo.healthy,
            },
        });
    }

    private async testTraktConnection(): Promise<{ connected: boolean; error?: string }> {
        const result = await this.handleAsync(
            () => this.traktService.testConnection(),
            'Trakt connection test failed'
        );

        if (!result.success) {
            return {
                connected: false,
                error: result.error?.body?.error || 'Connection test failed',
            };
        }

        return { connected: result.data! };
    }

    /**
     * Get load average - cross-platform compatible
     */
    private getLoadAverage(): number[] | undefined {
        try {
            // loadavg() is only available on Unix-like systems
            if (process.platform !== 'win32' && typeof (process as any).loadavg === 'function') {
                return (process as any).loadavg();
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Get CPU usage - cross-platform compatible
     */
    private getCpuUsage(): NodeJS.CpuUsage | undefined {
        try {
            return process.cpuUsage();
        } catch {
            return undefined;
        }
    }

    public getQuickMetrics(): {
        uptime: number;
        requests: number;
        errors: number;
        memory: NodeJS.MemoryUsage;
        cache: { tokens: number; rateLimits: number };
        database?: { type: string; healthy: boolean };
    } {
        const logStats = this.logger.getLogStats();

        const metrics = {
            uptime: Math.floor(process.uptime()),
            requests: logStats.totalRequests,
            errors: logStats.errorRequests,
            memory: process.memoryUsage(),
            cache: {
                tokens: this.tokenCacheService.getCacheSize(),
                rateLimits: this.rateLimitService.getStoreSize(),
            },
        };

        // Add database info if available
        if (this.databaseManager) {
            (metrics as any).database = {
                type: this.databaseManager.getConfig().type,
                healthy: false, // Would need async call to check
            };
        }

        return metrics;
    }

    /**
     * PUBLIC: Safe diagnostics method for internal application use
     * Returns sanitized diagnostic information without sensitive details
     */
    public async getApplicationDiagnostics(): Promise<{
        healthy: boolean;
        services: { trakt: boolean; database: boolean };
        performance: { memoryOk: boolean; errorRateOk: boolean };
    }> {
        const traktConnection = await this.testTraktConnection();
        const logStats = this.logger.getLogStats();
        const memoryUsage = process.memoryUsage();
        const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

        // Check database health
        let databaseHealthy = true;
        if (this.databaseManager) {
            try {
                databaseHealthy = await this.databaseManager.isHealthy();
            } catch {
                databaseHealthy = false;
            }
        }

        const healthy = traktConnection.connected &&
            parseFloat(logStats.errorRate) < 10 &&
            memoryUsagePercent < 90 &&
            databaseHealthy;

        return {
            healthy,
            services: {
                trakt: traktConnection.connected,
                database: databaseHealthy,
            },
            performance: {
                memoryOk: memoryUsagePercent < 90,
                errorRateOk: parseFloat(logStats.errorRate) < 10,
            },
        };
    }

    /**
     * Get database maintenance results
     */
    public async performDatabaseMaintenance(): Promise<{
        performed: boolean;
        results?: any;
        error?: string;
    }> {
        if (!this.databaseManager) {
            return {
                performed: false,
                error: 'No database configured',
            };
        }

        try {
            const results = await this.databaseManager.performMaintenance();
            return {
                performed: true,
                results,
            };
        } catch (error) {
            return {
                performed: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Get advanced cache metrics (async-aware)
     */
    public async getAdvancedCacheMetrics(): Promise<any> {
        try {
            return this.tokenCacheService.getPerformanceMetrics();
        } catch (error) {
            this.logger.log(`⚠️ Advanced cache metrics error: ${error}`, 'warn');
            return {
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Get detailed rate limiting stats
     */
    public getDetailedRateLimitStats(): any {
        try {
            return this.rateLimitService.getDetailedStats();
        } catch (error) {
            this.logger.log(`⚠️ Detailed rate limit stats error: ${error}`, 'warn');
            return {
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}