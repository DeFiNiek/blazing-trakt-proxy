/**
 * CORS middleware with configurable origins and security headers
 */

import { IncomingMessage, ServerResponse } from 'http';
import { SecurityConfig, ServerConfig } from '../types/config';
import { RequestContext, Middleware } from '../types/http';
import { LoggingService } from '../services/logging-service';

export class CorsMiddleware {
    private securityConfig: SecurityConfig;
    private serverConfig: ServerConfig;
    private logger: LoggingService;

    constructor(securityConfig: SecurityConfig, serverConfig: ServerConfig, logger: LoggingService) {
        this.securityConfig = securityConfig;
        this.serverConfig = serverConfig;
        this.logger = logger;
    }

    public middleware(): Middleware {
        return async (req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            this.setCorsHeaders(req, res);

            // Handle preflight requests
            if (req.method === 'OPTIONS') {
                this.logger.log(`✈️ CORS preflight request from ${context.ip}`, 'debug');
                res.writeHead(204);
                res.end();
                return;
            }

            await next();
        };
    }

    private setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
        const origin = req.headers.origin as string;

        // Set allowed origin
        const allowedOrigin = this.getAllowedOrigin(origin);
        if (allowedOrigin) {
            res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
            this.logger.log(`🌐 CORS origin allowed: ${allowedOrigin}`, 'debug');
        } else if (origin) {
            this.logger.log(`⛔ CORS origin rejected: ${origin}`, 'warn');
        }

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', this.getAllowedHeaders());
        res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
        res.setHeader('Access-Control-Allow-Credentials', 'false');
        res.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Remaining, X-RateLimit-Reset');
    }

    private getAllowedOrigin(origin?: string): string | null {
        if (!origin) {
            return null;
        }

        // Development mode: allow localhost and 127.0.0.1
        if (this.serverConfig.environment === 'development') {
            if (this.isLocalhost(origin)) {
                return origin;
            }
        }

        // Check configured allowed origins
        if (this.securityConfig.allowedOrigins.includes(origin)) {
            return origin;
        }

        // Check wildcard patterns (if any)
        for (const allowedOrigin of this.securityConfig.allowedOrigins) {
            if (this.matchesPattern(origin, allowedOrigin)) {
                return origin;
            }
        }

        return null;
    }

    private isLocalhost(origin: string): boolean {
        try {
            const url = new URL(origin);
            const hostname = url.hostname;

            return hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname === '0.0.0.0' ||
                hostname.endsWith('.localhost');
        } catch {
            return false;
        }
    }

    private matchesPattern(origin: string, pattern: string): boolean {
        if (pattern === '*') {
            this.logger.log('⚠️ Wildcard CORS origin detected - security risk!', 'warn');
            return true;
        }

        // Simple wildcard pattern matching
        if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return regex.test(origin);
        }

        return origin === pattern;
    }

    private getAllowedHeaders(): string {
        return [
            'Content-Type',
            'Authorization',
            'X-API-Key',
            'X-Requested-With',
            'Accept',
            'Origin',
        ].join(', ');
    }

    public validateOriginConfiguration(): {
        valid: boolean;
        warnings: string[];
        recommendations: string[]
    } {
        const warnings: string[] = [];
        const recommendations: string[] = [];

        // Check for wildcard in production
        if (this.serverConfig.environment === 'production') {
            if (this.securityConfig.allowedOrigins.includes('*')) {
                warnings.push('Wildcard (*) CORS origin detected in production');
                recommendations.push('Specify exact allowed origins for production');
            }

            // Check for localhost in production
            const hasLocalhost = this.securityConfig.allowedOrigins.some(origin =>
                origin.includes('localhost') || origin.includes('127.0.0.1')
            );
            if (hasLocalhost) {
                warnings.push('Localhost origins detected in production environment');
                recommendations.push('Remove localhost origins from production configuration');
            }
        }

        // Check for HTTP in production
        if (this.serverConfig.environment === 'production') {
            const hasHttp = this.securityConfig.allowedOrigins.some(origin =>
                origin.startsWith('http://')
            );
            if (hasHttp) {
                warnings.push('HTTP origins detected in production (should use HTTPS)');
                recommendations.push('Use HTTPS origins in production for security');
            }
        }

        // Check for empty origins
        if (this.securityConfig.allowedOrigins.length === 0) {
            warnings.push('No CORS origins configured');
            recommendations.push('Configure at least one allowed origin');
        }

        return {
            valid: warnings.length === 0,
            warnings,
            recommendations,
        };
    }

    public getOriginStats(): {
        allowed: string[];
        total: number;
        production: boolean;
        wildcardEnabled: boolean;
    } {
        return {
            allowed: [...this.securityConfig.allowedOrigins],
            total: this.securityConfig.allowedOrigins.length,
            production: this.serverConfig.environment === 'production',
            wildcardEnabled: this.securityConfig.allowedOrigins.includes('*'),
        };
    }

    public addAllowedOrigin(origin: string): void {
        if (!this.securityConfig.allowedOrigins.includes(origin)) {
            this.securityConfig.allowedOrigins.push(origin);
            this.logger.log(`🌐 Added CORS origin: ${origin}`, 'info');
        }
    }

    public removeAllowedOrigin(origin: string): boolean {
        const index = this.securityConfig.allowedOrigins.indexOf(origin);
        if (index !== -1) {
            this.securityConfig.allowedOrigins.splice(index, 1);
            this.logger.log(`🗑️ Removed CORS origin: ${origin}`, 'info');
            return true;
        }
        return false;
    }
}