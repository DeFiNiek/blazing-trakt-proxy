/**
 * Rate limiting service with database persistence support
 * Maintains backward compatibility with existing in-memory approach
 */

import { SecurityConfig } from '../types/config';
import { RateLimitEntry } from '../types/http';
import { DatabaseAdapter } from '../types/database';
import { LoggingService } from './logging-service';
import { SecurityUtils } from '../utils/security-utils';

export class RateLimitService {
    private config: SecurityConfig;
    private database: DatabaseAdapter | undefined;
    private memoryStore: Map<string, RateLimitEntry>; // Always available as fallback
    private logger: LoggingService;
    private cleanupInterval: NodeJS.Timeout;

    constructor(
        config: SecurityConfig,
        logger: LoggingService,
        database: DatabaseAdapter | undefined
    ) {
        this.config = config;
        this.logger = logger;
        this.database = database;
        this.memoryStore = new Map();

        // Start cleanup timer
        this.cleanupInterval = this.startCleanupTimer();

        const storageType = database ? 'database + memory' : 'memory only';
        this.logger.log(`🚦 RateLimitService initialized (${storageType})`, 'debug');
    }

    public async checkRateLimit(clientIp: string): Promise<boolean> {
        const now = Date.now();
        const windowStart = now - this.config.rateLimitWindowMs;

        try {
            let entry: RateLimitEntry | null = null;

            // Try database first
            if (this.database) {
                entry = await this.database.getRateLimit(clientIp);
            } else {
                entry = this.memoryStore.get(clientIp) || null;
            }

            if (!entry || entry.windowStart < windowStart) {
                // New window or first request
                entry = {
                    requests: 1,
                    windowStart: now,
                    lastRequest: now,
                };

                await this.storeRateLimit(clientIp, entry);
                return true;
            }

            // Check for suspicious rapid requests
            const timeSinceLastRequest = now - entry.lastRequest;
            if (timeSinceLastRequest < 100) {
                this.logger.log(`🚨 Suspicious rapid requests from ${SecurityUtils.maskIpAddress(clientIp)}`, 'warn');
            }

            entry.requests++;
            entry.lastRequest = now;

            await this.storeRateLimit(clientIp, entry);

            // Clean up store if it gets too large
            if (this.memoryStore.size > 10000) {
                this.cleanup(windowStart);
            }

            return entry.requests <= this.config.rateLimitMaxRequests;
        } catch (error) {
            this.logger.log(`⚠️ Rate limit check error, falling back to memory: ${error}`, 'warn');
            return this.checkMemoryRateLimit(clientIp);
        }
    }

    private async storeRateLimit(clientIp: string, entry: RateLimitEntry): Promise<void> {
        try {
            if (this.database) {
                await this.database.setRateLimit(clientIp, entry);
            } else {
                this.memoryStore.set(clientIp, entry);
            }
        } catch (error) {
            this.logger.log(`⚠️ Rate limit storage failed, using memory: ${error}`, 'warn');
            this.memoryStore.set(clientIp, entry);
        }
    }

    private checkMemoryRateLimit(clientIp: string): boolean {
        // Existing memory-based implementation as fallback
        const now = Date.now();
        const windowStart = now - this.config.rateLimitWindowMs;

        let entry = this.memoryStore.get(clientIp);

        if (!entry || entry.windowStart < windowStart) {
            entry = { requests: 1, windowStart: now, lastRequest: now };
            this.memoryStore.set(clientIp, entry);
            return true;
        }

        entry.requests++;
        entry.lastRequest = now;

        return entry.requests <= this.config.rateLimitMaxRequests;
    }

    public async getRateLimitInfo(clientIp: string): Promise<{
        requests: number;
        remaining: number;
        resetTime: number;
        windowStart: number;
    }> {
        let entry: RateLimitEntry | null = null;

        try {
            if (this.database) {
                entry = await this.database.getRateLimit(clientIp);
            } else {
                entry = this.memoryStore.get(clientIp) || null;
            }
        } catch (error) {
            this.logger.log(`⚠️ Rate limit info lookup error: ${error}`, 'warn');
            entry = this.memoryStore.get(clientIp) || null;
        }

        if (!entry) {
            return {
                requests: 0,
                remaining: this.config.rateLimitMaxRequests,
                resetTime: Date.now() + this.config.rateLimitWindowMs,
                windowStart: Date.now(),
            };
        }

        const remaining = Math.max(0, this.config.rateLimitMaxRequests - entry.requests);
        const resetTime = entry.windowStart + this.config.rateLimitWindowMs;

        return {
            requests: entry.requests,
            remaining,
            resetTime,
            windowStart: entry.windowStart,
        };
    }

    public getStoreSize(): number {
        return this.memoryStore.size;
    }

    private cleanup(cutoff: number): void {
        const beforeSize = this.memoryStore.size;
        let cleaned = 0;

        for (const [ip, entry] of this.memoryStore.entries()) {
            if (entry.windowStart < cutoff) {
                this.memoryStore.delete(ip);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.log(`🧹 Rate limit cleanup: removed ${cleaned} entries (${beforeSize} -> ${this.memoryStore.size})`, 'debug');
        }

        // Also cleanup database if available
        if (this.database) {
            this.database.cleanupRateLimits(cutoff).catch(error => {
                this.logger.log(`⚠️ Database rate limit cleanup error: ${error}`, 'warn');
            });
        }
    }

    private startCleanupTimer(): NodeJS.Timeout {
        // Run cleanup every 5 minutes
        return setInterval(() => {
            const cutoff = Date.now() - this.config.rateLimitWindowMs;
            this.cleanup(cutoff);
        }, 5 * 60 * 1000);
    }

    public reset(): void {
        this.memoryStore.clear();
        this.logger.log('🧹 Rate limit store reset', 'info');

        // Note: We don't clear database automatically for safety
        if (this.database) {
            this.logger.log('💡 Database rate limits not cleared - use admin interface if needed', 'info');
        }
    }

    public getTopOffenders(limit: number = 10): Array<{ ip: string; requests: number; lastRequest: number }> {
        return Array.from(this.memoryStore.entries())
            .map(([ip, entry]) => ({
                ip: SecurityUtils.maskIpAddress(ip),
                requests: entry.requests,
                lastRequest: entry.lastRequest,
            }))
            .sort((a, b) => b.requests - a.requests)
            .slice(0, limit);
    }

    public async blockIp(ip: string, durationMs: number = 3600000): Promise<void> {
        const now = Date.now();
        const blockEntry: RateLimitEntry = {
            requests: this.config.rateLimitMaxRequests + 1, // Exceed limit
            windowStart: now,
            lastRequest: now + durationMs, // Block until this time
        };

        await this.storeRateLimit(ip, blockEntry);
        this.logger.log(`🚫 IP blocked: ${SecurityUtils.maskIpAddress(ip)} for ${durationMs}ms`, 'warn');
    }

    public async unblockIp(ip: string): Promise<boolean> {
        let existed = false;

        // Remove from database
        if (this.database) {
            try {
                existed = await this.database.deleteToken(ip) || existed;
            } catch (error) {
                this.logger.log(`⚠️ Database unblock error: ${error}`, 'warn');
            }
        }

        // Remove from memory
        const memoryResult = this.memoryStore.delete(ip);
        existed = existed || memoryResult;

        if (existed) {
            this.logger.log(`✅ IP unblocked: ${SecurityUtils.maskIpAddress(ip)}`, 'info');
        }

        return existed;
    }

    public async isBlocked(ip: string): Promise<boolean> {
        let entry: RateLimitEntry | null = null;

        try {
            if (this.database) {
                entry = await this.database.getRateLimit(ip);
            } else {
                entry = this.memoryStore.get(ip) || null;
            }
        } catch (error) {
            this.logger.log(`⚠️ Block check error: ${error}`, 'warn');
            entry = this.memoryStore.get(ip) || null;
        }

        if (!entry) return false;

        const now = Date.now();
        const isInWindow = (now - entry.windowStart) < this.config.rateLimitWindowMs;
        const exceedsLimit = entry.requests > this.config.rateLimitMaxRequests;

        return isInWindow && exceedsLimit;
    }

    public getStats(): {
        totalEntries: number;
        activeWindows: number;
        blockedIps: number;
        averageRequestsPerIp: number;
        memoryEntries: number;
        databaseEntries?: number;
        storageType: 'memory' | 'database' | 'hybrid';
    } {
        const now = Date.now();
        const windowStart = now - this.config.rateLimitWindowMs;

        let activeWindows = 0;
        let blockedIps = 0;
        let totalRequests = 0;

        // Analyze memory store
        for (const entry of this.memoryStore.values()) {
            if (entry.windowStart >= windowStart) {
                activeWindows++;
                totalRequests += entry.requests;

                if (entry.requests > this.config.rateLimitMaxRequests) {
                    blockedIps++;
                }
            }
        }

        return {
            totalEntries: this.memoryStore.size,
            activeWindows,
            blockedIps,
            averageRequestsPerIp: activeWindows > 0 ? Math.round(totalRequests / activeWindows) : 0,
            memoryEntries: this.memoryStore.size,
            storageType: this.database ? 'hybrid' : 'memory',
        };
    }

    public destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.memoryStore.clear();

        // Don't disconnect database here - it's managed by DatabaseManager
        this.logger.log('🔄 RateLimitService destroyed', 'debug');
    }

    /**
     * Get detailed rate limiting metrics
     */
    public getDetailedStats(): {
        totalIps: number;
        activeIps: number;
        blockedIps: number;
        requestsInWindow: number;
        topRequesters: Array<{ ip: string; requests: number }>;
        blockedIpsList: Array<{ ip: string; blockedUntil: number }>;
        windowUtilization: number;
    } {
        const now = Date.now();
        const windowStart = now - this.config.rateLimitWindowMs;

        let activeIps = 0;
        let blockedIps = 0;
        let totalRequestsInWindow = 0;
        const requesters: Array<{ ip: string; requests: number }> = [];
        const blocked: Array<{ ip: string; blockedUntil: number }> = [];

        for (const [ip, entry] of this.memoryStore.entries()) {
            if (entry.windowStart >= windowStart) {
                activeIps++;
                totalRequestsInWindow += entry.requests;

                requesters.push({
                    ip: SecurityUtils.maskIpAddress(ip),
                    requests: entry.requests,
                });

                if (entry.requests > this.config.rateLimitMaxRequests) {
                    blockedIps++;
                    blocked.push({
                        ip: SecurityUtils.maskIpAddress(ip),
                        blockedUntil: entry.windowStart + this.config.rateLimitWindowMs,
                    });
                }
            }
        }

        // Sort requesters by request count
        requesters.sort((a, b) => b.requests - a.requests);

        // Calculate window utilization
        const maxPossibleRequests = activeIps * this.config.rateLimitMaxRequests;
        const windowUtilization = maxPossibleRequests > 0
            ? (totalRequestsInWindow / maxPossibleRequests) * 100
            : 0;

        return {
            totalIps: this.memoryStore.size,
            activeIps,
            blockedIps,
            requestsInWindow: totalRequestsInWindow,
            topRequesters: requesters.slice(0, 10),
            blockedIpsList: blocked,
            windowUtilization: Math.round(windowUtilization * 100) / 100,
        };
    }
}