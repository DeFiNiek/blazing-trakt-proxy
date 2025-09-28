/**
 * Database type definitions and interfaces
 */

import { CachedToken } from './trakt';
import { LogEntry, RateLimitEntry } from './http';
import { SecurityConfig, TraktConfig, ServerConfig, LoggingConfig } from './config';

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

export interface DatabaseStats {
    readonly totalRequests: number;
    readonly successfulRequests: number;
    readonly errorRequests: number;
    readonly uniqueIps: number;
    readonly topEndpoints: Array<{ path: string; count: number }>;
    readonly cacheHitRate: number;
    readonly averageResponseTime: number;
    readonly tokensCached: number;
    readonly rateLimitEntries: number;
}


export interface ApplicationConfig {
    readonly server: ServerConfig;
    readonly trakt: TraktConfig;
    readonly security: SecurityConfig;
    readonly logging: LoggingConfig;
    readonly database: DatabaseConfig;
}

export interface DatabaseAdapter {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    healthCheck(): Promise<boolean>;

    // Token cache operations
    storeToken(key: string, token: CachedToken): Promise<void>;
    getToken(key: string): Promise<CachedToken | null>;
    deleteToken(key: string): Promise<boolean>;
    cleanupExpiredTokens(): Promise<number>;
    getTokenCount(): Promise<number>;

    // Rate limiting operations
    getRateLimit(key: string): Promise<RateLimitEntry | null>;
    setRateLimit(key: string, entry: RateLimitEntry): Promise<void>;
    cleanupRateLimits(cutoff: number): Promise<number>;
    getRateLimitCount(): Promise<number>;

    // Analytics operations
    logRequest(entry: LogEntry): Promise<void>;
    getStats(timeRange?: number): Promise<DatabaseStats>;
    getRecentErrors(limit?: number): Promise<LogEntry[]>;

    // Maintenance operations
    vacuum?(): Promise<void>;
    getSize(): Promise<number>;
    backup?(destination: string): Promise<void>;
}