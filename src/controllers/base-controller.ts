/**
 * Base controller class with common functionality for all controllers
 */

import { RequestContext, ResponseContext, Controller } from '../types/http';
import { LoggingService } from '../services/logging-service';
import { ValidationUtils, ValidationSchema } from '../utils/validation-utils';
import { ErrorUtils } from '../utils/error-utils';

export abstract class BaseController implements Controller {
    protected logger: LoggingService;

    constructor(logger: LoggingService) {
        this.logger = logger;
    }

    public abstract handle(context: RequestContext): Promise<ResponseContext>;

    /**
     * Create a successful JSON response
     */
    protected createSuccessResponse<T>(
        data: T,
        statusCode: number = 200,
        headers: Record<string, string> = {}
    ): ResponseContext {
        return {
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            body: data,
            duration: 0,
        };
    }

    /**
     * Create an error response
     */
    protected createErrorResponse(
        statusCode: number,
        message: string,
        details?: any
    ): ResponseContext {
        return ErrorUtils.createErrorResponse(statusCode, message, undefined, details);
    }

    /**
     * Validate request body against a schema
     */
    protected validateRequestBody<T>(
        body: any,
        schema: ValidationSchema
    ): { valid: boolean; data?: T; errors?: string[]; warnings?: string[] } {
        const result = ValidationUtils.validateObject<T>(body, schema);

        if (!result.valid) {
            this.logger.log(`Validation failed: ${result.errors.join(', ')}`, 'warn');
        }

        return result;
    }

    /**
     * Validate query parameters
     */
    protected validateQueryParams(
        query: Record<string, string | string[]>,
        schema: ValidationSchema
    ): { valid: boolean; data?: any; errors?: string[] } {
        // Convert query params to proper types
        const processedQuery: any = {};

        for (const [key, value] of Object.entries(query)) {
            if (Array.isArray(value)) {
                processedQuery[key] = value;
            } else {
                // Try to convert string values to appropriate types
                if (value === 'true' || value === 'false') {
                    processedQuery[key] = value === 'true';
                } else if (/^\d+$/.test(value)) {
                    processedQuery[key] = parseInt(value, 10);
                } else {
                    processedQuery[key] = value;
                }
            }
        }

        const result = ValidationUtils.validateObject(processedQuery, schema);

        if (!result.valid) {
            this.logger.log(`Query validation failed: ${result.errors.join(', ')}`, 'warn');
        }

        return result;
    }

    /**
     * Extract client information from request context
     */
    protected getClientInfo(context: RequestContext): {
        ip: string;
        userAgent: string;
        timestamp: number;
        method: string;
        path: string;
    } {
        return {
            ip: context.ip,
            userAgent: context.userAgent,
            timestamp: context.timestamp,
            method: context.method,
            path: context.path,
        };
    }

    /**
     * Log controller action
     */
    protected logAction(
        action: string,
        context: RequestContext,
        success: boolean = true,
        details?: string
    ): void {
        const level = success ? 'info' : 'warn';
        const detailsStr = details ? ` - ${details}` : '';

        this.logger.log(
            `🎮 ${this.constructor.name}: ${action} for ${context.ip}${detailsStr}`,
            level
        );
    }

    /**
     * Handle async operations with error catching
     */
    protected async handleAsync<T>(
        operation: () => Promise<T>,
        errorMessage: string = 'Operation failed'
    ): Promise<{ success: boolean; data?: T; error?: ResponseContext }> {
        try {
            const data = await operation();
            return { success: true, data };
        } catch (error) {
            this.logger.log(`❌ ${errorMessage}: ${error}`, 'error');

            return {
                success: false,
                error: ErrorUtils.handleError(error),
            };
        }
    }

    /**
     * Check if request has required headers
     */
    protected validateRequiredHeaders(
        context: RequestContext,
        requiredHeaders: string[]
    ): { valid: boolean; missing: string[] } {
        const missing: string[] = [];

        for (const header of requiredHeaders) {
            if (!context.headers[header] && !context.headers[header.toLowerCase()]) {
                missing.push(header);
            }
        }

        return {
            valid: missing.length === 0,
            missing,
        };
    }

    /**
     * Get header value (case-insensitive)
     */
    protected getHeader(context: RequestContext, name: string): string | undefined {
        const lowerName = name.toLowerCase();
        const header = context.headers[name] || context.headers[lowerName];

        return Array.isArray(header) ? header[0] : header;
    }

    /**
     * Create paginated response
     */
    protected createPaginatedResponse<T>(
        data: T[],
        page: number,
        limit: number,
        total: number
    ): ResponseContext {
        const totalPages = Math.ceil(total / limit);
        const hasNext = page < totalPages;
        const hasPrev = page > 1;

        return this.createSuccessResponse({
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext,
                hasPrev,
            },
        });
    }

    /**
     * Validate content type
     */
    protected validateContentType(
        context: RequestContext,
        expectedTypes: string[]
    ): boolean {
        const contentType = this.getHeader(context, 'content-type');

        if (!contentType) {
            return false;
        }

        return expectedTypes.some(type => contentType.includes(type));
    }

    /**
     * Extract bearer token from authorization header
     */
    protected extractBearerToken(context: RequestContext): string | null {
        const authHeader = this.getHeader(context, 'authorization');

        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        return null;
    }

    /**
     * Create response with cache headers
     */
    protected createCachedResponse<T>(
        data: T,
        maxAge: number = 300, // 5 minutes default
        statusCode: number = 200
    ): ResponseContext {
        return this.createSuccessResponse(data, statusCode, {
            'Cache-Control': `public, max-age=${maxAge}`,
            'ETag': `"${Date.now()}"`,
        });
    }

    /**
     * Create no-cache response
     */
    protected createNoCacheResponse<T>(
        data: T,
        statusCode: number = 200
    ): ResponseContext {
        return this.createSuccessResponse(data, statusCode, {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
    }
}