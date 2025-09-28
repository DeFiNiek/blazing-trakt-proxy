/**
 * Error handling utilities with standardized error responses
 */

import { ResponseContext, ErrorResponse } from '../types/http';

export class ErrorUtils {
    /**
     * Create a standardized error response
     */
    public static createErrorResponse(
        statusCode: number,
        message: string,
        path?: string,
        details?: any
    ): ResponseContext {
        const error: ErrorResponse & { details?: any } = {
            error: message,
            status: statusCode,
            timestamp: Date.now(),
            ...(path && { path }),
            ...(details && { details }),
        };

        return {
            statusCode,
            headers: { 'Content-Type': 'application/json' },
            body: error,
            duration: 0,
        };
    }

    /**
     * Create a validation error response
     */
    public static createValidationError(
        errors: string[],
        warnings?: string[]
    ): ResponseContext {
        return this.createErrorResponse(400, 'Validation failed', undefined, {
            errors,
            ...(warnings && warnings.length > 0 && { warnings }),
        });
    }

    /**
     * Create an authentication error response
     */
    public static createAuthError(message: string = 'Authentication required'): ResponseContext {
        return {
            statusCode: 401,
            headers: {
                'Content-Type': 'application/json',
                'WWW-Authenticate': 'Bearer realm="API"',
            },
            body: {
                error: message,
                status: 401,
                timestamp: Date.now(),
            },
            duration: 0,
        };
    }

    /**
     * Create a rate limit error response
     */
    public static createRateLimitError(retryAfter: number = 60): ResponseContext {
        return {
            statusCode: 429,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': retryAfter.toString(),
            },
            body: {
                error: 'Rate limit exceeded',
                status: 429,
                timestamp: Date.now(),
                retryAfter,
                message: 'Too many requests. Please slow down.',
            },
            duration: 0,
        };
    }

    /**
     * Handle and format various types of errors
     */
    public static handleError(error: unknown, path?: string): ResponseContext {
        if (error instanceof ValidationError) {
            return this.createValidationError(error.errors, error.warnings);
        }

        if (error instanceof AuthenticationError) {
            return this.createAuthError(error.message);
        }

        if (error instanceof RateLimitError) {
            return this.createRateLimitError(error.retryAfter);
        }

        if (error instanceof TraktApiError) {
            return this.createErrorResponse(
                error.statusCode,
                error.message,
                path,
                { traktError: error.traktError }
            );
        }

        // Generic error handling
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        const isServerError = !(error instanceof ClientError);

        return isServerError
            ? this.createErrorResponse(500, message, path)
            : this.createErrorResponse(400, message, path);
    }

    /**
     * Check if an error is a client error (4xx)
     */
    public static isClientError(statusCode: number): boolean {
        return statusCode >= 400 && statusCode < 500;
    }

    /**
     * Check if an error is a server error (5xx)
     */
    public static isServerError(statusCode: number): boolean {
        return statusCode >= 500 && statusCode < 600;
    }

    /**
     * Get human-readable error message for status codes
     */
    public static getStatusMessage(statusCode: number): string {
        const statusMessages: Record<number, string> = {
            400: 'Bad Request',
            401: 'Unauthorized',
            403: 'Forbidden',
            404: 'Not Found',
            405: 'Method Not Allowed',
            409: 'Conflict',
            422: 'Unprocessable Entity',
            429: 'Too Many Requests',
            500: 'Internal Server Error',
            502: 'Bad Gateway',
            503: 'Service Unavailable',
            504: 'Gateway Timeout',
        };

        return statusMessages[statusCode] || 'Unknown Error';
    }
}

/**
 * Custom error classes for better error handling
 */

export class AppError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public code?: string
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(
        public errors: string[],
        public warnings: string[] = []
    ) {
        super(`Validation failed: ${errors.join(', ')}`, 400, 'VALIDATION_ERROR');
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication required') {
        super(message, 401, 'AUTH_ERROR');
    }
}

export class AuthorizationError extends AppError {
    constructor(message: string = 'Insufficient permissions') {
        super(message, 403, 'AUTHZ_ERROR');
    }
}

export class RateLimitError extends AppError {
    constructor(
        message: string = 'Rate limit exceeded',
        public retryAfter: number = 60
    ) {
        super(message, 429, 'RATE_LIMIT_ERROR');
    }
}

export class TraktApiError extends AppError {
    constructor(
        message: string,
        statusCode: number,
        public traktError?: any
    ) {
        super(message, statusCode, 'TRAKT_API_ERROR');
    }
}

export class ClientError extends AppError {
    constructor(message: string, statusCode: number = 400) {
        super(message, statusCode, 'CLIENT_ERROR');
    }
}

export class ConfigurationError extends AppError {
    constructor(message: string) {
        super(message, 500, 'CONFIG_ERROR');
    }
}