/**
 * Authentication middleware with timing-safe API key validation
 */

import { IncomingMessage, ServerResponse } from 'http';
import { SecurityConfig } from '../types/config';
import { RequestContext, Middleware } from '../types/http';
import { LoggingService } from '../services/logging-service';
import { SecurityUtils } from '../utils/security-utils';
import { ErrorUtils } from '../utils/error-utils';

export class AuthMiddleware {
    private config: SecurityConfig;
    private logger: LoggingService;

    constructor(config: SecurityConfig, logger: LoggingService) {
        this.config = config;
        this.logger = logger;
    }

    public middleware(): Middleware {
        return async (req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            if (!this.authenticate(req)) {
                this.logger.log(`🔒 Authentication failed for ${context.ip} on ${context.path}`, 'warn');
                this.sendUnauthorized(res);
                return;
            }

            this.logger.log(`🔓 Authentication successful for ${SecurityUtils.maskIpAddress(context.ip)}`, 'debug');
            await next();
        };
    }

    private authenticate(req: IncomingMessage): boolean {
        const providedKey = this.extractApiKey(req);

        if (!providedKey) {
            return false;
        }

        return SecurityUtils.verifyApiKey(providedKey, this.config.apiKeyHash);
    }

    private extractApiKey(req: IncomingMessage): string | null {
        // Check Authorization header (Bearer token)
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Check X-API-Key header
        const apiKeyHeader = req.headers['x-api-key'];
        if (typeof apiKeyHeader === 'string') {
            return apiKeyHeader;
        }

        return null;
    }

    private sendUnauthorized(res: ServerResponse): void {
        const errorResponse = ErrorUtils.createAuthError('Valid API key required');

        res.writeHead(errorResponse.statusCode, errorResponse.headers);
        res.end(JSON.stringify(errorResponse.body));
    }

    public createOptionalAuthMiddleware(): Middleware {
        return async (req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>) => {
            const providedKey = this.extractApiKey(req);

            if (providedKey) {
                const isValid = SecurityUtils.verifyApiKey(providedKey, this.config.apiKeyHash);
                if (!isValid) {
                    this.logger.log(`🔒 Invalid API key provided from ${context.ip}`, 'warn');
                    this.sendUnauthorized(res);
                    return;
                }

                // Add authenticated flag to context
                (context as any).authenticated = true;
                this.logger.log(`🔓 Optional authentication successful for ${SecurityUtils.maskIpAddress(context.ip)}`, 'debug');
            } else {
                (context as any).authenticated = false;
            }

            await next();
        };
    }

    public validateKeyFormat(apiKey: string): { valid: boolean; issues: string[] } {
        return SecurityUtils.validateApiKeyStrength(apiKey);
    }

    public generateSecureApiKey(): string {
        return SecurityUtils.generateApiKey();
    }

    public hashApiKey(apiKey: string): string {
        return SecurityUtils.hashApiKey(apiKey);
    }
}