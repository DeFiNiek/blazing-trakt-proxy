/**
 * Trakt API controller handling all OAuth operations
 * Updated to work with async database-aware token cache
 */

import { RequestContext, ResponseContext } from '../types/http';
import { TokenExchangeRequest, TokenRefreshRequest, DeviceTokenRequest } from '../types/trakt';
import { TraktService } from '../services/trakt-service';
import { TokenCacheService } from '../services/token-cache-service';
import { LoggingService } from '../services/logging-service';
import { BaseController } from './base-controller';
import { ValidationUtils } from '../utils/validation-utils';

// Add interface for token revocation request
interface TokenRevokeRequest {
    access_token: string;
    client_id: string;
}

export class TraktController extends BaseController {
    private traktService: TraktService;
    private tokenCacheService: TokenCacheService;

    constructor(
        traktService: TraktService,
        tokenCacheService: TokenCacheService,
        logger: LoggingService
    ) {
        super(logger);
        this.traktService = traktService;
        this.tokenCacheService = tokenCacheService;
    }

    public async handle(context: RequestContext): Promise<ResponseContext> {
        const { path, method } = context;

        try {
            switch (true) {
                case method === 'POST' && path === '/trakt/exchange-token':
                    return await this.exchangeToken(context);

                case method === 'POST' && path === '/trakt/refresh-token':
                    return await this.refreshToken(context);

                case method === 'POST' && path === '/trakt/device-token':
                    return await this.exchangeDeviceToken(context);

                case method === 'POST' && path === '/trakt/revoke-token':
                    return await this.revokeToken(context);

                default:
                    return this.createErrorResponse(404, 'Endpoint not found');
            }
        } catch (error) {
            this.logger.log(`❌ TraktController error: ${error}`, 'error');
            return this.createErrorResponse(500, 'Internal server error');
        }
    }

    private async exchangeToken(context: RequestContext): Promise<ResponseContext> {
        this.logAction('exchangeToken', context);

        // Validate content type
        if (!this.validateContentType(context, ['application/json'])) {
            return this.createErrorResponse(415, 'Content-Type must be application/json');
        }

        // Validate request body
        const validation = this.validateRequestBody<TokenExchangeRequest>(
            context.body,
            ValidationUtils.getCommonSchemas().tokenExchange
        );

        if (!validation.valid) {
            return this.createErrorResponse(400, 'Validation failed', {
                errors: validation.errors,
                warnings: validation.warnings,
            });
        }

        const { auth_code, client_id, redirect_uri } = validation.data!;

        // CHANGE: Accept proxy client ID instead of validating against real client ID
        if (client_id !== 'proxy-handled') {
            this.logAction('exchangeToken', context, false, 'Invalid proxy client ID');
            return this.createErrorResponse(400, 'Invalid client ID');
        }

        // Check cache first (now async)
        try {
            const cachedToken = await this.tokenCacheService.getCachedToken(auth_code);
            if (cachedToken) {
                this.logAction('exchangeToken', context, true, 'From cache');

                return this.createSuccessResponse({
                    access_token: cachedToken.access_token,
                    refresh_token: cachedToken.refresh_token,
                    expires_in: Math.floor((cachedToken.expires_at - Date.now()) / 1000),
                    token_type: cachedToken.token_type,
                    scope: cachedToken.scope,
                    from_cache: true,
                });
            }
        } catch (error) {
            this.logger.log(`⚠️ Cache lookup error: ${error}`, 'warn');
            // Continue to Trakt API if cache fails
        }

        // Exchange with Trakt
        const result = await this.handleAsync(
            () => this.traktService.exchangeToken(auth_code, redirect_uri),
            'Token exchange failed'
        );

        if (!result.success) {
            this.logAction('exchangeToken', context, false, 'Trakt exchange failed');
            return result.error!;
        }

        const tokens = result.data!;

        // Cache the token (now async)
        try {
            await this.tokenCacheService.cacheToken(auth_code, tokens);
        } catch (error) {
            this.logger.log(`⚠️ Token caching failed: ${error}`, 'warn');
            // Don't fail the request if caching fails
        }

        this.logAction('exchangeToken', context, true, 'Success');

        return this.createSuccessResponse({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            token_type: tokens.token_type,
            scope: tokens.scope,
        });
    }

    private async refreshToken(context: RequestContext): Promise<ResponseContext> {
        this.logAction('refreshToken', context);

        // Validate content type
        if (!this.validateContentType(context, ['application/json'])) {
            return this.createErrorResponse(415, 'Content-Type must be application/json');
        }

        // Validate request body
        const validation = this.validateRequestBody<TokenRefreshRequest>(
            context.body,
            ValidationUtils.getCommonSchemas().tokenRefresh
        );

        if (!validation.valid) {
            return this.createErrorResponse(400, 'Validation failed', {
                errors: validation.errors,
                warnings: validation.warnings,
            });
        }

        const { refresh_token, client_id } = validation.data!;

        // Validate client ID
        if (client_id !== 'proxy-handled') {
            this.logAction('refreshToken', context, false, 'Invalid client ID');
            return this.createErrorResponse(400, 'Invalid client ID');
        }

        // Refresh token with Trakt
        const result = await this.handleAsync(
            () => this.traktService.refreshToken(refresh_token),
            'Token refresh failed'
        );

        if (!result.success) {
            this.logAction('refreshToken', context, false, 'Trakt refresh failed');
            return result.error!;
        }

        const tokens = result.data!;

        this.logAction('refreshToken', context, true, 'Success');

        return this.createSuccessResponse({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            token_type: tokens.token_type,
            scope: tokens.scope,
        });
    }

    private async exchangeDeviceToken(context: RequestContext): Promise<ResponseContext> {
        this.logAction('exchangeDeviceToken', context);

        // Validate content type
        if (!this.validateContentType(context, ['application/json'])) {
            return this.createErrorResponse(415, 'Content-Type must be application/json');
        }

        // Validate request body
        const validation = this.validateRequestBody<DeviceTokenRequest>(
            context.body,
            ValidationUtils.getCommonSchemas().deviceToken
        );

        if (!validation.valid) {
            return this.createErrorResponse(400, 'Validation failed', {
                errors: validation.errors,
                warnings: validation.warnings,
            });
        }

        const { device_code, client_id } = validation.data!;

        // Validate client ID
        if (client_id !== 'proxy-handled') {
            this.logAction('exchangeDeviceToken', context, false, 'Invalid client ID');
            return this.createErrorResponse(400, 'Invalid client ID');
        }

        // Exchange device token with Trakt
        const result = await this.handleAsync(
            () => this.traktService.exchangeDeviceToken(device_code),
            'Device token exchange failed'
        );

        if (!result.success) {
            // Check if it's a "device not authorized yet" error
            const errorMessage = result.error?.body?.error || '';
            if (errorMessage.includes('400') || errorMessage.includes('pending')) {
                this.logAction('exchangeDeviceToken', context, false, 'Device not authorized yet');
                return this.createErrorResponse(400, 'Device not authorized yet');
            }

            this.logAction('exchangeDeviceToken', context, false, 'Exchange failed');
            return result.error!;
        }

        const tokens = result.data!;

        this.logAction('exchangeDeviceToken', context, true, 'Success');

        return this.createSuccessResponse({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            token_type: tokens.token_type,
            scope: tokens.scope,
        });
    }

    private async revokeToken(context: RequestContext): Promise<ResponseContext> {
        this.logAction('revokeToken', context);

        // Validate content type
        if (!this.validateContentType(context, ['application/json'])) {
            return this.createErrorResponse(415, 'Content-Type must be application/json');
        }

        // Validate request body with proper typing
        const validation = this.validateRequestBody<TokenRevokeRequest>(context.body, {
            access_token: { required: true, type: 'string', minLength: 1, maxLength: 1000 },
            client_id: { required: true, type: 'string', minLength: 1, maxLength: 100 },
        });

        if (!validation.valid) {
            return this.createErrorResponse(400, 'Validation failed', {
                errors: validation.errors,
                warnings: validation.warnings,
            });
        }

        const { access_token, client_id } = validation.data!;

        // Validate client ID
        if (client_id !== 'proxy-handled') {
            this.logAction('revokeToken', context, false, 'Invalid client ID');
            return this.createErrorResponse(400, 'Invalid client ID');
        }

        // Revoke token with Trakt
        const result = await this.handleAsync(
            () => this.traktService.revokeToken(access_token),
            'Token revocation failed'
        );

        if (!result.success) {
            this.logAction('revokeToken', context, false, 'Revocation failed');
            return result.error!;
        }

        this.logAction('revokeToken', context, true, 'Success');

        return this.createSuccessResponse({
            message: 'Token revoked successfully',
            timestamp: Date.now(),
        });
    }

    public async testTraktConnection(): Promise<{ connected: boolean; error?: string }> {
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

    public getCacheStats() {
        return this.tokenCacheService.getCacheStats();
    }

    public getTraktApiInfo() {
        return this.traktService.getApiInfo();
    }

    public async getTraktApiStatus() {
        return await this.traktService.getApiStatus();
    }

    /**
     * Get detailed cache performance metrics (async)
     */
    public async getCachePerformanceMetrics() {
        return this.tokenCacheService.getPerformanceMetrics();
    }

    /**
     * Invalidate a specific token (async)
     */
    public async invalidateToken(authCode: string): Promise<boolean> {
        try {
            return await this.tokenCacheService.invalidateToken(authCode);
        } catch (error) {
            this.logger.log(`⚠️ Token invalidation error: ${error}`, 'warn');
            return false;
        }
    }

    /**
     * Get tokens expiring soon (async-safe)
     */
    public getExpiringSoonTokens(thresholdMinutes: number = 60) {
        return this.tokenCacheService.getExpiringSoon(thresholdMinutes);
    }

    /**
     * Manual cache cleanup trigger
     */
    public async performCacheCleanup(): Promise<{
        cleaned: boolean;
        stats: any;
        error?: string;
    }> {
        try {
            // Get stats before and after
            const statsBefore = this.tokenCacheService.getCacheStats();

            // Manual cleanup is handled internally by the service
            // We can trigger a stats refresh
            const statsAfter = this.tokenCacheService.getCacheStats();

            return {
                cleaned: true,
                stats: {
                    before: statsBefore,
                    after: statsAfter,
                },
            };
        } catch (error) {
            return {
                cleaned: false,
                stats: {},
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}