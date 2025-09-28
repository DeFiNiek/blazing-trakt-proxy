/**
 * Rate limiting middleware with advanced bot detection and flexible rules
 */

import { IncomingMessage, ServerResponse } from 'http';
import { RequestContext, Middleware } from '../types/http';
import { RateLimitService } from '../services/ratelimit-service';
import { LoggingService } from '../services/logging-service';
import { SecurityUtils } from '../utils/security-utils';
import { ErrorUtils } from '../utils/error-utils';

export class RateLimitMiddleware {
    private rateLimitService: RateLimitService;
    private logger: LoggingService;

    constructor(rateLimitService: RateLimitService, logger: LoggingService) {
        this.rateLimitService = rateLimitService;
        this.logger = logger;
    }

    public middleware(): Middleware {
        return async (req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            const allowed = await this.rateLimitService.checkRateLimit(context.ip);

            // Set rate limit headers (now async)
            await this.setRateLimitHeaders(res, context.ip);

            // Enhanced logging with request method from req
            if (!allowed) {
                this.logger.log(
                    `🚫 Rate limit exceeded for ${SecurityUtils.maskIpAddress(context.ip)} on ${req.method} ${context.path}`,
                    'warn'
                );
                this.sendRateLimitExceeded(res);
                return;
            }

            await next();
        };
    }

    // FIXED: Make this method async
    private async setRateLimitHeaders(res: ServerResponse, clientIp: string): Promise<void> {
        const rateLimitInfo = await this.rateLimitService.getRateLimitInfo(clientIp);

        res.setHeader('X-RateLimit-Limit', rateLimitInfo.requests + rateLimitInfo.remaining);
        res.setHeader('X-RateLimit-Remaining', rateLimitInfo.remaining);
        res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitInfo.resetTime / 1000));
        res.setHeader('X-RateLimit-Window', '60'); // seconds
    }

    private sendRateLimitExceeded(res: ServerResponse): void {
        const errorResponse = ErrorUtils.createRateLimitError(60);

        res.writeHead(errorResponse.statusCode, errorResponse.headers);
        res.end(JSON.stringify(errorResponse.body));
    }

    public createBotDetectionMiddleware(): Middleware {
        return async (req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            const suspiciousScore = await this.calculateSuspiciousScore(req, context);

            if (suspiciousScore.suspicious) {
                this.logger.log(
                    `🤖 Potential bot detected from ${SecurityUtils.maskIpAddress(context.ip)} (score: ${suspiciousScore.score}) - ${suspiciousScore.reasons.join(', ')}`,
                    'warn'
                );

                // Apply stricter rate limiting for suspicious requests
                const botKey = `${context.ip}:bot`;
                const allowed = await this.rateLimitService.checkRateLimit(botKey);

                if (!allowed) {
                    this.sendRateLimitExceeded(res);
                    return;
                }
            }

            await next();
        };
    }

    // FIXED: Make this method async to handle async rate limit info
    private async calculateSuspiciousScore(req: IncomingMessage, context: RequestContext): Promise<{
        suspicious: boolean;
        score: number;
        reasons: string[];
    }> {
        const userAgentAnalysis = SecurityUtils.isSuspiciousUserAgent(context.userAgent);
        let score = userAgentAnalysis.score;
        const reasons = [...userAgentAnalysis.reasons];

        // Check for suspicious headers
        const headers = req.headers;

        // Missing common browser headers
        if (!headers.accept || !headers['accept-language']) {
            score += 20;
            reasons.push('Missing common browser headers');
        }

        // Suspicious Accept header
        if (headers.accept === '*/*') {
            score += 10;
            reasons.push('Suspicious Accept header');
        }

        // Missing Referer for POST requests (suspicious for form submissions)
        if (context.method === 'POST' && !headers.referer) {
            score += 30;
            reasons.push('Missing Referer on POST request');
        }

        // Check request patterns (now async)
        const rateLimitInfo = await this.rateLimitService.getRateLimitInfo(context.ip);
        if (rateLimitInfo.requests > 5) {
            score += 20;
            reasons.push('High request frequency');
        }

        // Check for automation indicators
        if (headers['x-forwarded-for'] && !headers['x-real-ip']) {
            score += 15;
            reasons.push('Suspicious proxy headers');
        }

        return {
            suspicious: score >= 50,
            score,
            reasons,
        };
    }

    public createCustomRateLimitMiddleware(options: {
        windowMs: number;
        maxRequests: number;
        keyGenerator?: (context: RequestContext) => string;
        skipSuccessful?: boolean;
        skipFailed?: boolean;
    }): Middleware {
        const customStore = new Map<string, { count: number; resetTime: number }>();

        return async (req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            const key = options.keyGenerator
                ? options.keyGenerator(context)
                : SecurityUtils.generateRateLimitKey(context.ip, context.path);

            const now = Date.now();

            let entry = customStore.get(key);

            if (!entry || entry.resetTime < now) {
                entry = {
                    count: 1,
                    resetTime: now + options.windowMs,
                };
                customStore.set(key, entry);
            } else {
                entry.count++;
            }

            // Clean up old entries periodically
            if (customStore.size > 1000) {
                for (const [k, v] of customStore.entries()) {
                    if (v.resetTime < now) {
                        customStore.delete(k);
                    }
                }
            }

            if (entry.count > options.maxRequests) {
                this.logger.log(
                    `🚫 Custom rate limit exceeded for ${SecurityUtils.maskIpAddress(context.ip)} on ${req.method} ${context.path}`,
                    'warn'
                );
                this.sendRateLimitExceeded(res);
                return;
            }

            await next();
        };
    }

    public createEndpointSpecificMiddleware(endpointLimits: Record<string, {
        windowMs: number;
        maxRequests: number;
    }>): Middleware {
        return async (req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            const endpointConfig = endpointLimits[context.path];

            if (endpointConfig) {
                const customMiddleware = this.createCustomRateLimitMiddleware({
                    ...endpointConfig,
                    keyGenerator: (ctx) => `${ctx.ip}:${ctx.path}`,
                });

                await customMiddleware(req, res, context, next);
            } else {
                await next();
            }
        };
    }

    public getMiddlewareStats(): {
        storeSize: number;
        topOffenders: Array<{ ip: string; requests: number; lastRequest: number }>;
        rateLimitStats: any;
    } {
        return {
            storeSize: this.rateLimitService.getStoreSize(),
            topOffenders: this.rateLimitService.getTopOffenders(5),
            rateLimitStats: this.rateLimitService.getStats(),
        };
    }

    public createWhitelistMiddleware(whitelistedIps: string[]): Middleware {
        return async (req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            if (whitelistedIps.includes(context.ip)) {
                this.logger.log(`✅ Whitelisted IP bypassing rate limit: ${SecurityUtils.maskIpAddress(context.ip)}`, 'debug');
                await next();
                return;
            }

            // Apply normal rate limiting for non-whitelisted IPs
            await this.middleware()(req, res, context, next);
        };
    }
}