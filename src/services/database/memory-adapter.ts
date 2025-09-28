/**
 * In-memory database adapter - fallback implementation
 * Maintains all existing functionality without persistence
 */

import { DatabaseAdapter, DatabaseStats } from '../../types/database';
import { CachedToken } from '../../types/trakt';
import { LogEntry, RateLimitEntry } from '../../types/http';
import { SecurityUtils } from '../../utils/security-utils';

export class MemoryAdapter implements DatabaseAdapter {
    private tokens: Map<string, CachedToken> = new Map();
    private rateLimits: Map<string, RateLimitEntry> = new Map();
    private requestLogs: LogEntry[] = [];
    private connected = false;

    private readonly maxLogs = 10000; // Prevent memory bloat
    private readonly maxTokens = 5000;
    private readonly maxRateLimits = 10000;

    async connect(): Promise<void> {
        this.connected = true;
        console.log('🧠 Memory adapter initialized');
    }

    async disconnect(): Promise<void> {
        this.tokens.clear();
        this.rateLimits.clear();
        this.requestLogs = [];
        this.connected = false;
        console.log('🧠 Memory adapter disconnected');
    }

    async healthCheck(): Promise<boolean> {
        return this.connected;
    }

    // Token operations
    async storeToken(key: string, token: CachedToken): Promise<void> {
        // Cleanup if approaching limits
        if (this.tokens.size >= this.maxTokens) {
            await this.cleanupExpiredTokens();

            // If still at limit, remove oldest entries
            if (this.tokens.size >= this.maxTokens) {
                const entries = Array.from(this.tokens.entries());
                entries.sort(([, a], [, b]) => a.cached_at - b.cached_at);

                const toRemove = Math.floor(entries.length * 0.1); // Remove 10%
                for (let i = 0; i < toRemove; i++) {
                    this.tokens.delete(entries[i][0]);
                }
            }
        }

        this.tokens.set(key, token);
    }

    async getToken(key: string): Promise<CachedToken | null> {
        const token = this.tokens.get(key);

        if (!token) {
            return null;
        }

        // Check expiration
        if (token.expires_at <= Date.now()) {
            this.tokens.delete(key);
            return null;
        }

        return token;
    }

    async deleteToken(key: string): Promise<boolean> {
        return this.tokens.delete(key);
    }

    async cleanupExpiredTokens(): Promise<number> {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, token] of this.tokens.entries()) {
            if (token.expires_at <= now) {
                this.tokens.delete(key);
                cleaned++;
            }
        }

        return cleaned;
    }

    async getTokenCount(): Promise<number> {
        return this.tokens.size;
    }

    // Rate limiting operations
    async getRateLimit(key: string): Promise<RateLimitEntry | null> {
        return this.rateLimits.get(key) || null;
    }

    async setRateLimit(key: string, entry: RateLimitEntry): Promise<void> {
        // Cleanup if approaching limits
        if (this.rateLimits.size >= this.maxRateLimits) {
            const cutoff = Date.now() - (60 * 60 * 1000); // 1 hour ago
            await this.cleanupRateLimits(cutoff);
        }

        this.rateLimits.set(key, entry);
    }

    async cleanupRateLimits(cutoff: number): Promise<number> {
        let cleaned = 0;

        for (const [key, entry] of this.rateLimits.entries()) {
            if (entry.windowStart < cutoff) {
                this.rateLimits.delete(key);
                cleaned++;
            }
        }

        return cleaned;
    }

    async getRateLimitCount(): Promise<number> {
        return this.rateLimits.size;
    }

    // Analytics operations
    async logRequest(entry: LogEntry): Promise<void> {
        this.requestLogs.push(entry);

        // Trim logs if too many
        if (this.requestLogs.length > this.maxLogs) {
            const excess = this.requestLogs.length - this.maxLogs;
            this.requestLogs.splice(0, excess);
        }
    }

    async getStats(timeRange: number = 24 * 60 * 60 * 1000): Promise<DatabaseStats> {
        const cutoff = Date.now() - timeRange;
        const recentLogs = this.requestLogs.filter(log => log.timestamp > cutoff);

        const totalRequests = recentLogs.length;
        const successfulRequests = recentLogs.filter(log => log.success).length;
        const errorRequests = totalRequests - successfulRequests;

        // Calculate unique IPs
        const uniqueIps = new Set(recentLogs.map(log => SecurityUtils.maskIpAddress(log.ip))).size;

        // Calculate top endpoints
        const endpointCounts: Record<string, number> = {};
        recentLogs.forEach(log => {
            endpointCounts[log.path] = (endpointCounts[log.path] || 0) + 1;
        });

        const topEndpoints = Object.entries(endpointCounts)
            .map(([path, count]) => ({ path, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Calculate average response time
        const logsWithDuration = recentLogs.filter(log => log.duration !== undefined);
        const averageResponseTime = logsWithDuration.length > 0
            ? logsWithDuration.reduce((sum, log) => sum + (log.duration || 0), 0) / logsWithDuration.length
            : 0;

        // Cache hit rate (simplified - based on token retrievals)
        const validTokens = Array.from(this.tokens.values())
            .filter(token => token.expires_at > Date.now()).length;
        const cacheHitRate = totalRequests > 0 ? (validTokens / totalRequests) * 100 : 0;

        return {
            totalRequests,
            successfulRequests,
            errorRequests,
            uniqueIps,
            topEndpoints,
            cacheHitRate: Math.min(100, cacheHitRate), // Cap at 100%
            averageResponseTime: Math.round(averageResponseTime),
            tokensCached: this.tokens.size,
            rateLimitEntries: this.rateLimits.size,
        };
    }

    async getRecentErrors(limit: number = 10): Promise<LogEntry[]> {
        return this.requestLogs
            .filter(log => !log.success)
            .slice(-limit)
            .reverse(); // Most recent first
    }

    // Memory-specific operations
    async getSize(): Promise<number> {
        // Rough estimate of memory usage in bytes
        const tokenSize = JSON.stringify(Array.from(this.tokens.entries())).length;
        const rateLimitSize = JSON.stringify(Array.from(this.rateLimits.entries())).length;
        const logSize = JSON.stringify(this.requestLogs).length;

        return tokenSize + rateLimitSize + logSize;
    }

    public getMemoryStats(): {
        tokens: number;
        rateLimits: number;
        requestLogs: number;
        estimatedSizeBytes: number;
    } {
        return {
            tokens: this.tokens.size,
            rateLimits: this.rateLimits.size,
            requestLogs: this.requestLogs.length,
            estimatedSizeBytes: 0, // Would calculate actual size
        };
    }

    public clearAll(): void {
        this.tokens.clear();
        this.rateLimits.clear();
        this.requestLogs = [];
    }
}