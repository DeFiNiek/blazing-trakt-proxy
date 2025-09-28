/**
 * Token caching service with database persistence support
 * Maintains backward compatibility with existing in-memory approach
 */

import { SecurityConfig } from '../types/config';
import { TraktTokenResponse, CachedToken } from '../types/trakt';
import { DatabaseAdapter } from '../types/database';
import { LoggingService } from './logging-service';
import { SecurityUtils } from '../utils/security-utils';

export class TokenCacheService {
    private config: SecurityConfig;
    private database: DatabaseAdapter | undefined; // FIXED: Make this explicitly optional
    private memoryCache: Map<string, CachedToken>; // Always available as fallback
    private logger: LoggingService;
    private cleanupInterval: NodeJS.Timeout;
    private maxCacheSize: number;

    // Statistics tracking
    private cacheHits = 0;
    private cacheMisses = 0;
    private dbHits = 0;
    private memoryHits = 0;

    constructor(
        config: SecurityConfig,
        logger: LoggingService,
        database?: DatabaseAdapter // FIXED: Keep this as optional parameter
    ) {
        this.config = config;
        this.logger = logger;
        this.database = database; // FIXED: This now matches the type
        this.memoryCache = new Map(); // Always available as fallback

        // Use config for cache limits
        this.maxCacheSize = Math.max(100, Math.floor(config.rateLimitMaxRequests * 5));

        // Start cleanup timer based on config TTL
        this.cleanupInterval = this.startCleanupTimer();

        const storageType = database ? 'database + memory' : 'memory only';
        this.logger.log(`💾 TokenCacheService initialized (${storageType})`, 'debug');
    }

    public async cacheToken(authCode: string, tokens: TraktTokenResponse): Promise<void> {
        const cacheKey = SecurityUtils.generateCacheKey(authCode, 'token');
        const now = Date.now();

        // Use config TTL if no expires_in provided
        const expiresIn = tokens.expires_in || this.config.tokenCacheTtl;

        const cachedToken: CachedToken = {
            ...tokens,
            cached_at: now,
            expires_at: now + (expiresIn * 1000),
        };

        // Try database first, fall back to memory
        try {
            if (this.database) {
                await this.database.storeToken(cacheKey, cachedToken);
                this.logger.log(`💾 Token cached to database for key ${cacheKey.substring(0, 8)}... (TTL: ${expiresIn}s)`, 'debug');
            } else {
                // Memory-only path
                await this.storeInMemory(cacheKey, cachedToken);
                this.logger.log(`🧠 Token cached to memory for key ${cacheKey.substring(0, 8)}... (TTL: ${expiresIn}s)`, 'debug');
            }
        } catch (error) {
            this.logger.log(`⚠️ Database cache failed, using memory fallback: ${error}`, 'warn');
            await this.storeInMemory(cacheKey, cachedToken);
        }
    }

    private async storeInMemory(cacheKey: string, cachedToken: CachedToken): Promise<void> {
        // Check cache size limits before adding
        if (this.memoryCache.size >= this.maxCacheSize) {
            this.evictOldestEntries();
        }

        this.memoryCache.set(cacheKey, cachedToken);
    }

    private evictOldestEntries(): void {
        const entries = Array.from(this.memoryCache.entries());
        entries.sort(([, a], [, b]) => a.cached_at - b.cached_at);

        // Remove oldest 25% of entries
        const toRemove = Math.floor(entries.length * 0.25);
        for (let i = 0; i < toRemove; i++) {
            this.memoryCache.delete(entries[i][0]);
        }

        this.logger.log(`🧹 Evicted ${toRemove} oldest cache entries due to size limit`, 'debug');
    }

    public async getCachedToken(authCode: string): Promise<CachedToken | null> {
        const cacheKey = SecurityUtils.generateCacheKey(authCode, 'token');

        try {
            // Try database first
            if (this.database) {
                const token = await this.database.getToken(cacheKey);
                if (token) {
                    this.cacheHits++;
                    this.dbHits++;
                    this.logger.log(`✅ Database cache hit for key ${cacheKey.substring(0, 8)}...`, 'debug');
                    return token;
                }
            }

            // Fallback to memory cache
            const memoryToken = this.memoryCache.get(cacheKey);
            if (memoryToken && memoryToken.expires_at > Date.now()) {
                this.cacheHits++;
                this.memoryHits++;
                this.logger.log(`🧠 Memory cache hit for key ${cacheKey.substring(0, 8)}...`, 'debug');
                return memoryToken;
            }

            // Clean up expired memory token
            if (memoryToken && memoryToken.expires_at <= Date.now()) {
                this.memoryCache.delete(cacheKey);
            }

            this.cacheMisses++;
            return null;
        } catch (error) {
            this.logger.log(`⚠️ Cache lookup error: ${error}`, 'warn');

            // Try memory fallback
            const memoryToken = this.memoryCache.get(cacheKey);
            if (memoryToken && memoryToken.expires_at > Date.now()) {
                this.cacheHits++;
                this.memoryHits++;
                return memoryToken;
            }

            this.cacheMisses++;
            return null;
        }
    }

    public getCacheSize(): number {
        // Return memory cache size (database size would need async query)
        return this.memoryCache.size;
    }

    public getCacheStats(): {
        size: number;
        type: 'memory' | 'database' | 'hybrid';
        expired: number;
        validTokens: number;
        hitRate: number;
        oldestToken: number;
        newestToken: number;
        maxSize: number;
        configTtl: number;
        cacheHits: number;
        cacheMisses: number;
        dbHits: number;
        memoryHits: number;
    } {
        const now = Date.now();
        let expired = 0;
        let valid = 0;
        let oldestTimestamp = now;
        let newestTimestamp = 0;

        // Analyze memory cache
        for (const token of this.memoryCache.values()) {
            if (token.expires_at <= now) {
                expired++;
            } else {
                valid++;
            }

            oldestTimestamp = Math.min(oldestTimestamp, token.cached_at);
            newestTimestamp = Math.max(newestTimestamp, token.cached_at);
        }

        // Calculate hit rate
        const totalRequests = this.cacheHits + this.cacheMisses;
        const hitRate = totalRequests > 0 ? (this.cacheHits / totalRequests) * 100 : 0;

        return {
            size: this.memoryCache.size,
            type: this.database ? 'hybrid' : 'memory',
            expired,
            validTokens: valid,
            hitRate: Math.round(hitRate),
            oldestToken: oldestTimestamp,
            newestToken: newestTimestamp,
            maxSize: this.maxCacheSize,
            configTtl: this.config.tokenCacheTtl,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            dbHits: this.dbHits,
            memoryHits: this.memoryHits,
        };
    }

    private cleanup(): void {
        const now = Date.now();
        const beforeSize = this.memoryCache.size;
        let cleaned = 0;

        for (const [key, token] of this.memoryCache.entries()) {
            if (token.expires_at <= now) {
                this.memoryCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.log(`🧹 Token cache cleanup: removed ${cleaned} expired tokens (${beforeSize} -> ${this.memoryCache.size})`, 'debug');
        }

        // Also cleanup database if available (database will handle this internally)
        if (this.database) {
            this.database.cleanupExpiredTokens().catch(error => {
                this.logger.log(`⚠️ Database cleanup error: ${error}`, 'warn');
            });
        }
    }

    private startCleanupTimer(): NodeJS.Timeout {
        // Use config-based cleanup interval (tokenCacheTtl / 6, min 5 minutes)
        const cleanupInterval = Math.max(5 * 60 * 1000, this.config.tokenCacheTtl * 1000 / 6);

        return setInterval(() => {
            this.cleanup();
        }, cleanupInterval);
    }

    public async invalidateToken(authCode: string): Promise<boolean> {
        const cacheKey = SecurityUtils.generateCacheKey(authCode, 'token');
        let invalidated = false;

        // Remove from database
        if (this.database) {
            try {
                const dbResult = await this.database.deleteToken(cacheKey);
                if (dbResult) {
                    invalidated = true;
                    this.logger.log(`🗑️ Token invalidated from database for key ${cacheKey.substring(0, 8)}...`, 'debug');
                }
            } catch (error) {
                this.logger.log(`⚠️ Database invalidation error: ${error}`, 'warn');
            }
        }

        // Remove from memory
        const memoryResult = this.memoryCache.delete(cacheKey);
        if (memoryResult) {
            invalidated = true;
            this.logger.log(`🗑️ Token invalidated from memory for key ${cacheKey.substring(0, 8)}...`, 'debug');
        }

        return invalidated;
    }

    public clear(): void {
        const size = this.memoryCache.size;
        this.memoryCache.clear();

        // Reset statistics
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.dbHits = 0;
        this.memoryHits = 0;

        this.logger.log(`🧹 Token cache cleared (${size} tokens removed from memory)`, 'info');

        // Note: We don't clear database automatically for safety
        if (this.database) {
            this.logger.log('💡 Database tokens not cleared - use admin interface if needed', 'info');
        }
    }

    public getTokensByAge(): Array<{
        key: string;
        age: number;
        expiresIn: number;
        accessToken: string;
        source: 'memory' | 'database';
    }> {
        const now = Date.now();

        // Return memory cache analysis (database would need async query)
        return Array.from(this.memoryCache.entries()).map(([key, token]) => ({
            key: key.substring(0, 8) + '...',
            age: Math.floor((now - token.cached_at) / 1000 / 60), // minutes
            expiresIn: Math.floor((token.expires_at - now) / 1000 / 60), // minutes
            accessToken: token.access_token.substring(0, 8) + '...',
            source: 'memory' as const,
        })).sort((a, b) => b.age - a.age);
    }

    public getExpiringSoon(thresholdMinutes: number = 60): Array<{
        key: string;
        expiresIn: number;
        accessToken: string;
        source: 'memory' | 'database';
    }> {
        const now = Date.now();
        const threshold = thresholdMinutes * 60 * 1000;

        return Array.from(this.memoryCache.entries())
            .filter(([, token]) => {
                const timeToExpiry = token.expires_at - now;
                return timeToExpiry > 0 && timeToExpiry <= threshold;
            })
            .map(([key, token]) => ({
                key: key.substring(0, 8) + '...',
                expiresIn: Math.floor((token.expires_at - now) / 1000 / 60),
                accessToken: token.access_token.substring(0, 8) + '...',
                source: 'memory' as const,
            }));
    }

    public async refreshToken(authCode: string, newTokens: TraktTokenResponse): Promise<boolean> {
        const cacheKey = SecurityUtils.generateCacheKey(authCode, 'token');

        // Check if token exists first
        const existingToken = await this.getCachedToken(authCode);
        if (!existingToken) {
            return false;
        }

        // Update with new token data
        const now = Date.now();
        const expiresIn = newTokens.expires_in || this.config.tokenCacheTtl;

        const updatedToken: CachedToken = {
            ...newTokens,
            cached_at: now,
            expires_at: now + (expiresIn * 1000),
        };

        try {
            if (this.database) {
                await this.database.storeToken(cacheKey, updatedToken);
            }
            this.memoryCache.set(cacheKey, updatedToken);

            this.logger.log(`🔄 Token refreshed for key ${cacheKey.substring(0, 8)}...`, 'debug');
            return true;
        } catch (error) {
            this.logger.log(`⚠️ Token refresh failed: ${error}`, 'warn');
            return false;
        }
    }

    public destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.memoryCache.clear();

        // Don't disconnect database here - it's managed by DatabaseManager
        this.logger.log('🔄 TokenCacheService destroyed', 'debug');
    }

    /**
     * Get detailed cache performance metrics
     */
    public getPerformanceMetrics(): {
        totalRequests: number;
        hitRate: number;
        missRate: number;
        dbHitRate: number;
        memoryHitRate: number;
        averageTokenAge: number;
        cacheEfficiency: number;
    } {
        const totalRequests = this.cacheHits + this.cacheMisses;
        const hitRate = totalRequests > 0 ? (this.cacheHits / totalRequests) * 100 : 0;
        const missRate = 100 - hitRate;
        const dbHitRate = totalRequests > 0 ? (this.dbHits / totalRequests) * 100 : 0;
        const memoryHitRate = totalRequests > 0 ? (this.memoryHits / totalRequests) * 100 : 0;

        // Calculate average token age
        const now = Date.now();
        const tokenAges = Array.from(this.memoryCache.values())
            .map(token => (now - token.cached_at) / 1000 / 60); // minutes
        const averageTokenAge = tokenAges.length > 0
            ? tokenAges.reduce((sum, age) => sum + age, 0) / tokenAges.length
            : 0;

        // Cache efficiency: hit rate weighted by token freshness
        const cacheEfficiency = hitRate * (1 - Math.min(averageTokenAge / (this.config.tokenCacheTtl / 60), 1));

        return {
            totalRequests,
            hitRate: Math.round(hitRate * 100) / 100,
            missRate: Math.round(missRate * 100) / 100,
            dbHitRate: Math.round(dbHitRate * 100) / 100,
            memoryHitRate: Math.round(memoryHitRate * 100) / 100,
            averageTokenAge: Math.round(averageTokenAge * 100) / 100,
            cacheEfficiency: Math.round(cacheEfficiency * 100) / 100,
        };
    }
}