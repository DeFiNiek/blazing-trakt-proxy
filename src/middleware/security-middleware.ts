/**
 * Security middleware for headers, input validation, and request security
 */

import { IncomingMessage, ServerResponse } from 'http';
import { ServerConfig } from '../types/config';
import { RequestContext, Middleware } from '../types/http';
import { LoggingService } from '../services/logging-service';
import { SecurityUtils } from '../utils/security-utils';
import { ValidationUtils } from '../utils/validation-utils';
import { ErrorUtils } from '../utils/error-utils';

export class SecurityMiddleware {
    private config: ServerConfig;
    private logger: LoggingService;

    constructor(config: ServerConfig, logger: LoggingService) {
        this.config = config;
        this.logger = logger;
    }

    public securityHeadersMiddleware(): Middleware {
        return async (_req: IncomingMessage, res: ServerResponse, _context: RequestContext, next: () => Promise<void>) => {
            this.setSecurityHeaders(res);
            await next();
        };
    }

    private setSecurityHeaders(res: ServerResponse): void {
        const headers: Record<string, string> = {
            'X-Content-Type-Options': 'nosniff', // cspell:disable-line
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Referrer-Policy': 'no-referrer',
            'X-Download-Options': 'noopen', // cspell:disable-line
            'X-Permitted-Cross-Domain-Policies': 'none',
            'Server': 'SecureProxy/2.0.0',
            'X-Powered-By': '', // Remove default header
        };

        if (this.config.enableHttps) {
            headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
        }

        // Content Security Policy
        headers['Content-Security-Policy'] = [
            "default-src 'none'",
            "frame-ancestors 'none'",
            "base-uri 'none'",
            "form-action 'none'"
        ].join('; ');

        // Feature Policy / Permissions Policy
        headers['Permissions-Policy'] = [
            'camera=()',
            'microphone=()',
            'geolocation=()',
            'payment=()',
            'usb=()',
            'magnetometer=()',
            'accelerometer=()',
            'gyroscope=()'
        ].join(', ');

        Object.entries(headers).forEach(([key, value]) => {
            res.setHeader(key, value);
        });
    }

    public requestSizeMiddleware(): Middleware {
        return async (_req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            const contentLength = parseInt(context.headers['content-length'] as string || '0');

            // Use ValidationUtils for proper validation
            const validation = ValidationUtils.validateBodySize(contentLength, this.config.maxRequestBodySize);

            if (!validation.valid) {
                this.logger.log(`🚫 Request size validation failed from ${SecurityUtils.maskIpAddress(context.ip)}: ${validation.errors.join(', ')}`, 'warn');
                const errorResponse = ErrorUtils.createErrorResponse(413, validation.errors[0]);
                res.writeHead(errorResponse.statusCode, errorResponse.headers);
                res.end(JSON.stringify(errorResponse.body));
                return;
            }

            await next();
        };
    }

    public inputSanitizationMiddleware(): Middleware {
        return async (_req: IncomingMessage, _res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            // Sanitize URL parameters
            if (context.query) {
                for (const [key, value] of Object.entries(context.query)) {
                    if (typeof value === 'string') {
                        const sanitized = SecurityUtils.sanitizeInput(value);
                        if (sanitized !== value) {
                            this.logger.log(`🧹 Sanitized query parameter '${key}' from ${SecurityUtils.maskIpAddress(context.ip)}`, 'debug');
                        }
                        context.query[key] = sanitized;
                    } else if (Array.isArray(value)) {
                        // Handle array values
                        context.query[key] = value.map(v => typeof v === 'string' ? SecurityUtils.sanitizeInput(v) : v);
                    }
                }
            }

            // Sanitize headers (specific ones that might be logged or processed)
            const headersToSanitize = ['referer', 'user-agent', 'x-forwarded-for'];
            for (const header of headersToSanitize) {
                const headerValue = context.headers[header];
                if (typeof headerValue === 'string') {
                    const sanitized = SecurityUtils.sanitizeInput(headerValue);
                    if (sanitized !== headerValue) {
                        this.logger.log(`🧹 Sanitized header '${header}' from ${SecurityUtils.maskIpAddress(context.ip)}`, 'debug');
                    }
                    context.headers[header] = sanitized;
                }
            }

            await next();
        };
    }

    public requestValidationMiddleware(): Middleware {
        return async (_req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            const issues: string[] = [];
            const warnings: string[] = [];

            // Validate HTTP method
            const allowedMethods = ['GET', 'POST', 'OPTIONS'];
            if (!allowedMethods.includes(context.method)) {
                issues.push(`HTTP method ${context.method} not allowed`);
            }

            // Validate path length and format
            if (context.path.length > 1000) {
                issues.push('Request path too long');
            }

            if (context.path.length === 0 || !context.path.startsWith('/')) {
                issues.push('Invalid request path format');
            }

            // Check for suspicious patterns in path
            const suspiciousPatterns = [
                { pattern: /\.\./, description: 'Directory traversal attempt' },
                { pattern: /\/\/+/, description: 'Multiple consecutive slashes' },
                { pattern: /%00/, description: 'Null byte injection' },
                { pattern: /<script/i, description: 'Script tag injection' },
                { pattern: /javascript:/i, description: 'JavaScript URL scheme' },
                { pattern: /data:/i, description: 'Data URL scheme' },
                { pattern: /vbscript:/i, description: 'VBScript URL scheme' },
                { pattern: /file:/i, description: 'File URL scheme' },
                { pattern: /<iframe/i, description: 'Iframe injection' },
                { pattern: /on\w+=/i, description: 'Event handler injection' },
            ];

            for (const { pattern, description } of suspiciousPatterns) {
                if (pattern.test(context.path)) {
                    issues.push(`Suspicious pattern detected: ${description}`);
                    break; // Only report the first match to avoid noise
                }
            }

            // Validate User-Agent
            if (!context.userAgent || context.userAgent === 'unknown') {
                warnings.push('Missing or unknown User-Agent');
            } else if (context.userAgent.length > 500) {
                warnings.push('Unusually long User-Agent string');
            }

            // Validate URL encoding
            try {
                decodeURIComponent(context.path);
            } catch {
                issues.push('Invalid URL encoding in path');
            }

            // Check for common attack patterns in query parameters
            if (context.query && Object.keys(context.query).length > 50) {
                warnings.push('Unusually high number of query parameters');
            }

            // Log warnings (don't block request)
            if (warnings.length > 0) {
                this.logger.log(`⚠️ Request validation warnings from ${SecurityUtils.maskIpAddress(context.ip)}: ${warnings.join(', ')}`, 'warn');
            }

            // Block request for critical issues
            if (issues.length > 0) {
                this.logger.log(`🚫 Request validation failed from ${SecurityUtils.maskIpAddress(context.ip)}: ${issues.join(', ')}`, 'warn');
                const errorResponse = ErrorUtils.createErrorResponse(400, 'Invalid request', context.path, { issues });
                res.writeHead(errorResponse.statusCode, errorResponse.headers);
                res.end(JSON.stringify(errorResponse.body));
                return;
            }

            await next();
        };
    }

    // cspell:disable-next-line
    public slowlorisProtectionMiddleware(): Middleware {
        const activeConnections = new Map<string, {
            count: number;
            firstConnection: number;
            lastActivity: number;
        }>();

        return async (_req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            const now = Date.now();
            const connectionInfo = activeConnections.get(context.ip) || {
                count: 0,
                firstConnection: now,
                lastActivity: now,
            };

            // Update connection info
            connectionInfo.count++;
            connectionInfo.lastActivity = now;
            activeConnections.set(context.ip, connectionInfo);

            // Check for too many concurrent connections
            if (connectionInfo.count > 10) {
                this.logger.log(`🚫 Too many concurrent connections from ${SecurityUtils.maskIpAddress(context.ip)} (${connectionInfo.count})`, 'warn');
                const errorResponse = ErrorUtils.createErrorResponse(429, 'Too many concurrent connections');
                res.writeHead(errorResponse.statusCode, errorResponse.headers);
                res.end(JSON.stringify(errorResponse.body));
                return;
            }

            // Check for rapid connection patterns (potential slowloris attack)
            const connectionDuration = now - connectionInfo.firstConnection;
            if (connectionInfo.count > 5 && connectionDuration < 5000) { // 5 connections in 5 seconds
                this.logger.log(`🚫 Rapid connection pattern detected from ${SecurityUtils.maskIpAddress(context.ip)}`, 'warn');
                const errorResponse = ErrorUtils.createErrorResponse(429, 'Connection rate limit exceeded');
                res.writeHead(errorResponse.statusCode, errorResponse.headers);
                res.end(JSON.stringify(errorResponse.body));
                return;
            }

            // Set timeout for request
            const timeout = setTimeout(() => {
                this.logger.log(`⏰ Request timeout from ${SecurityUtils.maskIpAddress(context.ip)}`, 'warn');
                if (!res.headersSent) {
                    const errorResponse = ErrorUtils.createErrorResponse(408, 'Request timeout');
                    res.writeHead(errorResponse.statusCode, errorResponse.headers);
                    res.end(JSON.stringify(errorResponse.body));
                }
            }, 30000); // 30 second timeout

            // Cleanup on response finish
            res.on('finish', () => {
                clearTimeout(timeout);
                const info = activeConnections.get(context.ip);
                if (info) {
                    info.count = Math.max(0, info.count - 1);
                    if (info.count === 0) {
                        activeConnections.delete(context.ip);
                    } else {
                        activeConnections.set(context.ip, info);
                    }
                }
            });

            // Periodic cleanup of stale connections
            if (Math.random() < 0.01) { // 1% chance per request
                this.cleanupStaleConnections(activeConnections, now);
            }

            await next();
        };
    }

    private cleanupStaleConnections(
        connections: Map<string, { count: number; firstConnection: number; lastActivity: number }>,
        now: number
    ): void {
        const staleTimeout = 5 * 60 * 1000; // 5 minutes
        let cleaned = 0;

        for (const [ip, info] of connections.entries()) {
            if (now - info.lastActivity > staleTimeout) {
                connections.delete(ip);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this.logger.log(`🧹 Cleaned up ${cleaned} stale connection entries`, 'debug');
        }
    }

    public createContentTypeValidationMiddleware(allowedTypes: string[]): Middleware {
        return async (req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            if (['POST', 'PUT', 'PATCH'].includes(context.method)) {
                const contentType = req.headers['content-type'];

                if (!contentType) {
                    this.logger.log(`🚫 Missing Content-Type header from ${SecurityUtils.maskIpAddress(context.ip)}`, 'warn');
                    const errorResponse = ErrorUtils.createErrorResponse(400, 'Content-Type header required');
                    res.writeHead(errorResponse.statusCode, errorResponse.headers);
                    res.end(JSON.stringify(errorResponse.body));
                    return;
                }

                const isAllowed = allowedTypes.some(type => contentType.toLowerCase().includes(type.toLowerCase()));

                if (!isAllowed) {
                    this.logger.log(`🚫 Invalid Content-Type from ${SecurityUtils.maskIpAddress(context.ip)}: ${contentType}`, 'warn');
                    const errorResponse = ErrorUtils.createErrorResponse(415, 'Unsupported Media Type', context.path, {
                        allowedTypes,
                        providedType: contentType,
                    });
                    res.writeHead(errorResponse.statusCode, errorResponse.headers);
                    res.end(JSON.stringify(errorResponse.body));
                    return;
                }
            }

            await next();
        };
    }

    public createRateLimitByteMiddleware(maxBytesPerWindow: number, windowMs: number): Middleware {
        const byteLimits = new Map<string, { bytes: number; windowStart: number }>();

        return async (_req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            const contentLength = parseInt(context.headers['content-length'] as string || '0');
            const now = Date.now();
            const windowStart = now - windowMs;

            let entry = byteLimits.get(context.ip);
            if (!entry || entry.windowStart < windowStart) {
                entry = { bytes: contentLength, windowStart: now };
                byteLimits.set(context.ip, entry);
            } else {
                entry.bytes += contentLength;
            }

            if (entry.bytes > maxBytesPerWindow) {
                this.logger.log(`🚫 Byte rate limit exceeded from ${SecurityUtils.maskIpAddress(context.ip)} (${entry.bytes}/${maxBytesPerWindow})`, 'warn');
                const errorResponse = ErrorUtils.createErrorResponse(429, 'Bandwidth limit exceeded');
                res.writeHead(errorResponse.statusCode, errorResponse.headers);
                res.end(JSON.stringify(errorResponse.body));
                return;
            }

            // Cleanup old entries periodically
            if (byteLimits.size > 1000) {
                for (const [ip, info] of byteLimits.entries()) {
                    if (info.windowStart < windowStart) {
                        byteLimits.delete(ip);
                    }
                }
            }

            await next();
        };
    }

    public getSecurityStats(): {
        securityHeadersEnabled: boolean;
        httpsEnabled: boolean;
        maxRequestSize: number;
        environment: string;
        validationEnabled: boolean;
        sanitizationEnabled: boolean;
    } {
        return {
            securityHeadersEnabled: true,
            httpsEnabled: this.config.enableHttps,
            maxRequestSize: this.config.maxRequestBodySize,
            environment: this.config.environment,
            validationEnabled: true,
            sanitizationEnabled: true,
        };
    }
}