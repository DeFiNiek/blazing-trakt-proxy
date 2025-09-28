/**
 * Route definitions and setup with comprehensive security middleware
 */

import { Router } from './router';
import { TraktController } from '../controllers/trakt-controller';
import { HealthController } from '../controllers/health-controller';
import { AuthMiddleware } from '../middleware/auth-middleware';
import { CorsMiddleware } from '../middleware/cors-middleware';
import { RateLimitMiddleware } from '../middleware/ratelimit-middleware';
import { SecurityMiddleware } from '../middleware/security-middleware';
import { LoggingService } from '../services/logging-service';

export interface RouteConfig {
    traktController: TraktController;
    healthController: HealthController;
    authMiddleware: AuthMiddleware;
    corsMiddleware: CorsMiddleware;
    rateLimitMiddleware: RateLimitMiddleware;
    securityMiddleware: SecurityMiddleware;
    logger: LoggingService;
}

export function setupRoutes(config: RouteConfig): Router {
    const router = new Router(config.logger);

    // CRITICAL: Global security middleware (applied to ALL routes in order)
    // Order matters - security headers should be first
    router.use(config.securityMiddleware.securityHeadersMiddleware());

    // Request size validation (before parsing)
    router.use(config.securityMiddleware.requestSizeMiddleware());

    // Input sanitization (clean malicious input)
    router.use(config.securityMiddleware.inputSanitizationMiddleware());

    // Request validation (check for attack patterns)
    router.use(config.securityMiddleware.requestValidationMiddleware());

    // Slowloris protection (connection tracking)
    router.use(config.securityMiddleware.slowlorisProtectionMiddleware());

    // CORS handling (after security validation)
    router.use(config.corsMiddleware.middleware());

    // Rate limiting (after CORS)
    router.use(config.rateLimitMiddleware.middleware());

    // Content type validation for JSON endpoints
    const jsonContentTypeMiddleware = config.securityMiddleware.createContentTypeValidationMiddleware([
        'application/json'
    ]);

    // Bot detection middleware
    const botDetectionMiddleware = config.rateLimitMiddleware.createBotDetectionMiddleware();

    // Byte rate limiting for high-bandwidth abuse
    const byteRateLimitMiddleware = config.securityMiddleware.createRateLimitByteMiddleware(
        1024 * 1024, // 1MB per window
        60000        // 1 minute window
    );

    // Authentication middleware
    const authRequired = config.authMiddleware.middleware();

    // ==================================================
    // PUBLIC ROUTES (no authentication required)
    // ==================================================

    // Basic health check (minimal security)
    router.get('/health', config.healthController);

    // Metrics endpoint (no auth for monitoring systems, but with byte limiting)
    router.get('/metrics', config.healthController, [byteRateLimitMiddleware]);

    // ==================================================
    // PROTECTED ROUTES (authentication required)
    // ==================================================

    // Detailed status (requires auth)
    router.get('/status', config.healthController, [
        authRequired,
        byteRateLimitMiddleware,
    ]);

    // System diagnostics (requires auth, sensitive data)
    router.get('/diagnostics', config.healthController, [
        authRequired,
        byteRateLimitMiddleware,
    ]);

    // ==================================================
    // TRAKT OAUTH ENDPOINTS (high security)
    // ==================================================

    // Token exchange (most sensitive - strict rate limiting)
    router.post('/trakt/exchange-token', config.traktController, [
        authRequired,
        jsonContentTypeMiddleware,
        botDetectionMiddleware,
        config.rateLimitMiddleware.createCustomRateLimitMiddleware({
            windowMs: 300000,    // 5 minutes
            maxRequests: 3,      // Only 3 attempts per 5 minutes
            keyGenerator: (ctx) => `exchange:${ctx.ip}`,
        }),
    ]);

    // Token refresh (moderate security)
    router.post('/trakt/refresh-token', config.traktController, [
        authRequired,
        jsonContentTypeMiddleware,
        botDetectionMiddleware,
        config.rateLimitMiddleware.createCustomRateLimitMiddleware({
            windowMs: 60000,     // 1 minute
            maxRequests: 10,     // 10 refreshes per minute
            keyGenerator: (ctx) => `refresh:${ctx.ip}`,
        }),
    ]);

    // Device token exchange (moderate security)
    router.post('/trakt/device-token', config.traktController, [
        authRequired,
        jsonContentTypeMiddleware,
        botDetectionMiddleware,
        config.rateLimitMiddleware.createCustomRateLimitMiddleware({
            windowMs: 60000,     // 1 minute
            maxRequests: 15,     // 15 attempts per minute
            keyGenerator: (ctx) => `device:${ctx.ip}`,
        }),
    ]);

    // Token revocation (standard security)
    router.post('/trakt/revoke-token', config.traktController, [
        authRequired,
        jsonContentTypeMiddleware,
        botDetectionMiddleware,
        config.rateLimitMiddleware.createCustomRateLimitMiddleware({
            windowMs: 60000,     // 1 minute
            maxRequests: 20,     // 20 revocations per minute
            keyGenerator: (ctx) => `revoke:${ctx.ip}`,
        }),
    ]);

    // ==================================================
    // LOGGING AND MONITORING
    // ==================================================

    config.logger.log('🛤️ Routes configured with comprehensive security middleware', 'info');
    config.logger.log('🔐 Security layers active:', 'info');
    config.logger.log('   - Security headers', 'info');
    config.logger.log('   - Request size validation', 'info');
    config.logger.log('   - Input sanitization', 'info');
    config.logger.log('   - Attack pattern detection', 'info');
    config.logger.log('   - Slowloris protection', 'info');
    config.logger.log('   - CORS protection', 'info');
    config.logger.log('   - Rate limiting (global + endpoint-specific)', 'info');
    config.logger.log('   - Bot detection', 'info');
    config.logger.log('   - Byte rate limiting', 'info');
    config.logger.log('   - Authentication (protected endpoints)', 'info');

    return router;
}

export function getRouteInfo(): Array<{
    method: string;
    path: string;
    description: string;
    authentication: boolean;
    rateLimit: string;
    securityLevel: 'low' | 'medium' | 'high' | 'critical';
}> {
    return [
        {
            method: 'GET',
            path: '/health',
            description: 'Basic health check',
            authentication: false,
            rateLimit: 'Standard',
            securityLevel: 'low',
        },
        {
            method: 'GET',
            path: '/metrics',
            description: 'Application metrics',
            authentication: false,
            rateLimit: 'Standard + Byte limiting',
            securityLevel: 'medium',
        },
        {
            method: 'GET',
            path: '/diagnostics',
            description: 'System diagnostics (sensitive)',
            authentication: true,
            rateLimit: 'Standard + Byte limiting',
            securityLevel: 'high',
        },
        {
            method: 'POST',
            path: '/trakt/exchange-token',
            description: 'Exchange authorization code for access token',
            authentication: true,
            rateLimit: 'Critical (3/5min)',
            securityLevel: 'critical',
        },
        {
            method: 'POST',
            path: '/trakt/refresh-token',
            description: 'Refresh an expired access token',
            authentication: true,
            rateLimit: 'Strict (10/min)',
            securityLevel: 'high',
        },
        {
            method: 'POST',
            path: '/trakt/device-token',
            description: 'Exchange device code for access token',
            authentication: true,
            rateLimit: 'Limited (15/min)',
            securityLevel: 'high',
        },
        {
            method: 'POST',
            path: '/trakt/revoke-token',
            description: 'Revoke an access token',
            authentication: true,
            rateLimit: 'Standard (20/min)',
            securityLevel: 'medium',
        },
    ];
}

/**
 * Get security configuration summary
 */
export function getSecurityConfig(): {
    globalMiddleware: string[];
    protectedEndpoints: number;
    publicEndpoints: number;
    totalSecurityLayers: number;
} {
    const routes = getRouteInfo();

    return {
        globalMiddleware: [
            'Security Headers',
            'Request Size Validation',
            'Input Sanitization',
            'Request Validation',
            'Slowloris Protection',
            'CORS Protection',
            'Rate Limiting',
        ],
        protectedEndpoints: routes.filter(r => r.authentication).length,
        publicEndpoints: routes.filter(r => !r.authentication).length,
        totalSecurityLayers: 7,
    };
}
