/**
 * Custom router for handling HTTP requests and middleware
 */

import { IncomingMessage, ServerResponse } from 'http';
import { Route, RequestContext, ResponseContext, Middleware, HttpMethod, LogEntry } from '../types/http';
import { LoggingService } from '../services/logging-service';
import { ErrorUtils } from '../utils/error-utils';

export class Router {
    private routes: Route[] = [];
    private globalMiddleware: Middleware[] = [];
    private logger: LoggingService;

    constructor(logger: LoggingService) {
        this.logger = logger;
    }

    /**
     * Add a route to the router
     */
    public addRoute(route: Route): void {
        this.routes.push(route);
        this.logger.log(`📍 Route registered: ${route.method} ${route.path}`, 'debug');
    }

    /**
     * Add global middleware that runs on all requests
     */
    public use(middleware: Middleware): void {
        this.globalMiddleware.push(middleware);
        this.logger.log(`🔧 Global middleware registered`, 'debug');
    }

    /**
     * Handle incoming HTTP request
     */
    public async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const startTime = Date.now();
        const context = this.createRequestContext(req);

        try {
            // Find matching route
            const route = this.findRoute(context.method, context.path);

            if (!route) {
                const errorResponse = ErrorUtils.createErrorResponse(404, 'Route not found', context.path);
                await this.sendResponse(res, this.createTimedResponse(errorResponse, Date.now() - startTime));
                this.logRequest(context, false, 'Route not found', Date.now() - startTime, 404);
                return;
            }

            // Parse request body if needed
            if (this.shouldParseBody(context.method)) {
                try {
                    context.body = await this.parseRequestBody(req);
                } catch (error) {
                    const errorResponse = ErrorUtils.createErrorResponse(400, 'Invalid request body');
                    await this.sendResponse(res, this.createTimedResponse(errorResponse, Date.now() - startTime));
                    this.logRequest(context, false, 'Invalid request body', Date.now() - startTime, 400);
                    return;
                }
            }

            // Build middleware chain
            const middlewareChain = [
                ...this.globalMiddleware,
                ...(route.middleware || []),
            ];

            // Execute middleware chain and controller
            const response = await this.executeMiddlewareChain(
                req,
                res,
                context,
                middlewareChain,
                route
            );

            if (response) {
                const duration = Date.now() - startTime;
                const timedResponse = this.createTimedResponse(response, duration);

                await this.sendResponse(res, timedResponse);
                this.logRequest(context, true, undefined, duration, timedResponse.statusCode);
            }

        } catch (error) {
            this.logger.log(`❌ Request handling error: ${error}`, 'error');
            const errorResponse = ErrorUtils.handleError(error, context.path);
            const duration = Date.now() - startTime;
            const timedErrorResponse = this.createTimedResponse(errorResponse, duration);

            await this.sendResponse(res, timedErrorResponse);
            this.logRequest(context, false, String(error), duration, timedErrorResponse.statusCode);
        }
    }

    /**
     * Create a new ResponseContext with duration (avoiding readonly property modification)
     */
    private createTimedResponse(response: ResponseContext, duration: number): ResponseContext {
        return {
            statusCode: response.statusCode,
            headers: response.headers,
            body: response.body,
            duration: duration,
        };
    }

    /**
     * Create request context from incoming request
     */
    private createRequestContext(req: IncomingMessage): RequestContext {
        const requestUrl = req.url || '';
        const clientIp = this.getClientIp(req);

        // Use WHATWG URL API (no more url.parse() deprecation warnings)
        let path = '/';
        let query: Record<string, string | string[]> = {};

        try {
            // For relative URLs, construct a full URL for the WHATWG URL constructor
            const fullUrl = new URL(requestUrl, 'http://localhost');
            path = fullUrl.pathname;

            // Convert URLSearchParams to the expected Record format
            query = {};
            for (const [key, value] of fullUrl.searchParams.entries()) {
                if (query[key]) {
                    // Handle multiple values for the same parameter
                    if (Array.isArray(query[key])) {
                        (query[key] as string[]).push(value);
                    } else {
                        query[key] = [query[key] as string, value];
                    }
                } else {
                    query[key] = value;
                }
            }
        } catch (error) {
            // Fallback for malformed URLs - extract path manually without url.parse()
            this.logger.log(`⚠️ URL parsing error for "${requestUrl}": ${error}`, 'warn');

            // Manual URL parsing fallback to avoid any url.parse() usage
            try {
                const urlParts = requestUrl.split('?');
                path = decodeURIComponent(urlParts[0] || '/');

                // Use URLSearchParams for query string parsing (modern approach)
                if (urlParts[1]) {
                    const searchParams = new URLSearchParams(urlParts[1]);
                    query = {};
                    for (const [key, value] of searchParams.entries()) {
                        if (query[key]) {
                            if (Array.isArray(query[key])) {
                                (query[key] as string[]).push(value);
                            } else {
                                query[key] = [query[key] as string, value];
                            }
                        } else {
                            query[key] = value;
                        }
                    }
                }
            } catch (fallbackError) {
                this.logger.log(`⚠️ Fallback URL parsing also failed: ${fallbackError}`, 'warn');
                // Last resort - just use the path portion
                const pathMatch = requestUrl.match(/^([^?]*)/);
                path = pathMatch ? pathMatch[1] : '/';
                query = {};
            }
        }

        return {
            method: (req.method || 'GET') as HttpMethod,
            url: requestUrl,
            path,
            query,
            headers: req.headers as Record<string, string | string[]>,
            ip: clientIp,
            userAgent: (req.headers['user-agent'] as string) || 'unknown',
            timestamp: Date.now(),
        };
    }

    /**
     * Extract client IP address with proxy support
     */
    private getClientIp(req: IncomingMessage): string {
        const forwarded = req.headers['x-forwarded-for'] as string;
        if (forwarded) {
            return forwarded.split(',')[0].trim();
        }

        return (
            req.headers['x-real-ip'] as string ||
            req.connection.remoteAddress ||
            (req.socket as any).remoteAddress ||
            'unknown'
        );
    }

    /**
     * Find route matching method and path
     */
    private findRoute(method: HttpMethod, path: string): Route | null {
        return this.routes.find(route =>
            route.method === method && this.pathMatches(route.path, path)
        ) || null;
    }

    /**
     * Check if route path matches request path
     */
    private pathMatches(routePath: string, requestPath: string): boolean {
        // Exact match
        if (routePath === requestPath) {
            return true;
        }

        // Simple wildcard support (ending with /*)
        if (routePath.endsWith('/*')) {
            const basePath = routePath.slice(0, -2);
            return requestPath.startsWith(basePath);
        }

        // Parameter support (simple :param matching)
        const routeParts = routePath.split('/');
        const requestParts = requestPath.split('/');

        if (routeParts.length !== requestParts.length) {
            return false;
        }

        return routeParts.every((part, index) =>
            part.startsWith(':') || part === requestParts[index]
        );
    }

    /**
     * Check if request body should be parsed
     */
    private shouldParseBody(method: HttpMethod): boolean {
        return ['POST', 'PUT', 'PATCH'].includes(method);
    }

    /**
     * Parse request body
     */
    private parseRequestBody(req: IncomingMessage): Promise<any> {
        return new Promise((resolve, reject) => {
            let body = '';
            let size = 0;
            const maxSize = 10 * 1024; // 10KB limit

            req.on('data', (chunk) => {
                size += chunk.length;
                if (size > maxSize) {
                    reject(new Error('Request body too large'));
                    return;
                }
                body += chunk.toString();
            });

            req.on('end', () => {
                try {
                    if (body) {
                        const contentType = req.headers['content-type'] || '';
                        if (contentType.includes('application/json')) {
                            resolve(JSON.parse(body));
                        } else if (contentType.includes('application/x-www-form-urlencoded')) {
                            // Parse URL-encoded data
                            const params = new URLSearchParams(body);
                            const result: any = {};
                            for (const [key, value] of params) {
                                result[key] = value;
                            }
                            resolve(result);
                        } else {
                            resolve(body);
                        }
                    } else {
                        resolve(null);
                    }
                } catch (error) {
                    reject(new Error('Invalid request body format'));
                }
            });

            req.on('error', reject);

            // Timeout for body parsing
            const timeout = setTimeout(() => {
                reject(new Error('Request body timeout'));
            }, 30000);

            req.on('end', () => clearTimeout(timeout));
            req.on('error', () => clearTimeout(timeout));
        });
    }

    /**
     * Execute middleware chain and controller
     */
    private async executeMiddlewareChain(
        req: IncomingMessage,
        res: ServerResponse,
        context: RequestContext,
        middlewareChain: Middleware[],
        route: Route
    ): Promise<ResponseContext | null> {
        let middlewareIndex = 0;
        let controllerExecuted = false;
        let response: ResponseContext | null = null;
        let middlewareCompleted = false;

        const next = async (): Promise<void> => {
            if (res.headersSent) {
                // Response already sent by middleware
                middlewareCompleted = true;
                return;
            }

            if (middlewareIndex < middlewareChain.length) {
                const middleware = middlewareChain[middlewareIndex++];
                await middleware(req, res, context, next);
            } else if (!controllerExecuted && !middlewareCompleted) {
                controllerExecuted = true;
                response = await route.controller.handle(context);
            }
        };

        await next();

        // If middleware handled the response, don't return anything
        return middlewareCompleted ? null : response;
    }

    /**
     * Send HTTP response
     */
    private async sendResponse(res: ServerResponse, response: ResponseContext): Promise<void> {
        // Don't send if headers already sent
        if (res.headersSent) {
            return;
        }

        try {
            // Set headers
            Object.entries(response.headers).forEach(([key, value]) => {
                res.setHeader(key, value);
            });

            // Write response
            res.writeHead(response.statusCode);

            if (response.body !== undefined) {
                const body = typeof response.body === 'string'
                    ? response.body
                    : JSON.stringify(response.body, null, 2);
                res.end(body);
            } else {
                res.end();
            }
        } catch (error) {
            this.logger.log(`❌ Error sending response: ${error}`, 'error');

            // Try to send a basic error response
            if (!res.headersSent) {
                try {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Internal server error' }));
                } catch {
                    // Last resort
                    res.end();
                }
            }
        }
    }

    /**
     * Log request details with proper type handling for exactOptionalPropertyTypes
     */
    private logRequest(
        context: RequestContext,
        success: boolean,
        error?: string,
        duration?: number,
        statusCode?: number
    ): void {
        // Create base log entry
        const baseLogEntry = {
            timestamp: context.timestamp,
            ip: context.ip,
            method: context.method,
            path: context.path,
            userAgent: context.userAgent,
            success,
        };

        // Build the final log entry conditionally
        let logEntry: LogEntry;

        if (error !== undefined && duration !== undefined && statusCode !== undefined) {
            logEntry = { ...baseLogEntry, error, duration, statusCode };
        } else if (error !== undefined && duration !== undefined) {
            logEntry = { ...baseLogEntry, error, duration };
        } else if (error !== undefined && statusCode !== undefined) {
            logEntry = { ...baseLogEntry, error, statusCode };
        } else if (duration !== undefined && statusCode !== undefined) {
            logEntry = { ...baseLogEntry, duration, statusCode };
        } else if (error !== undefined) {
            logEntry = { ...baseLogEntry, error };
        } else if (duration !== undefined) {
            logEntry = { ...baseLogEntry, duration };
        } else if (statusCode !== undefined) {
            logEntry = { ...baseLogEntry, statusCode };
        } else {
            logEntry = baseLogEntry;
        }

        this.logger.logRequest(logEntry);
    }

    /**
     * Get route statistics
     */
    public getRouteStats(): {
        total: number;
        routes: Array<{ method: string; path: string; hasMiddleware: boolean }>;
        globalMiddleware: number;
    } {
        return {
            total: this.routes.length,
            globalMiddleware: this.globalMiddleware.length,
            routes: this.routes.map(route => ({
                method: route.method,
                path: route.path,
                hasMiddleware: (route.middleware?.length || 0) > 0,
            })),
        };
    }

    /**
     * Create method-specific route helpers with proper type handling
     */
    public get(path: string, controller: any, middleware?: Middleware[]): void {
        const route: Route = {
            method: 'GET',
            path,
            controller,
            middleware: middleware,
        };
        this.addRoute(route);
    }

    public post(path: string, controller: any, middleware?: Middleware[]): void {
        const route: Route = {
            method: 'POST',
            path,
            controller,
            middleware: middleware,
        };
        this.addRoute(route);
    }

    public put(path: string, controller: any, middleware?: Middleware[]): void {
        const route: Route = {
            method: 'PUT',
            path,
            controller,
            middleware: middleware,
        };
        this.addRoute(route);
    }

    public delete(path: string, controller: any, middleware?: Middleware[]): void {
        const route: Route = {
            method: 'DELETE',
            path,
            controller,
            middleware: middleware,
        };
        this.addRoute(route);
    }

    public options(path: string, controller: any, middleware?: Middleware[]): void {
        const route: Route = {
            method: 'OPTIONS',
            path,
            controller,
            middleware: middleware,
        };
        this.addRoute(route);
    }

    /**
     * Remove a route
     */
    public removeRoute(method: HttpMethod, path: string): boolean {
        const index = this.routes.findIndex(route =>
            route.method === method && route.path === path
        );

        if (index !== -1) {
            this.routes.splice(index, 1);
            this.logger.log(`📍 Route removed: ${method} ${path}`, 'debug');
            return true;
        }

        return false;
    }

    /**
     * Clear all routes
     */
    public clearRoutes(): void {
        const count = this.routes.length;
        this.routes = [];
        this.logger.log(`📍 Cleared ${count} routes`, 'debug');
    }
}