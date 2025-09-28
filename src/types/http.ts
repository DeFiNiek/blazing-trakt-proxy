/**
 * HTTP and request/response type definitions
 */

import { IncomingMessage, ServerResponse } from 'http';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';

export interface RequestContext {
    readonly method: HttpMethod;
    readonly url: string;
    readonly path: string;
    readonly query: Record<string, string | string[]>;
    readonly headers: Record<string, string | string[]>;
    readonly ip: string;
    readonly userAgent: string;
    readonly timestamp: number;
    body?: any;
}

export interface ResponseContext {
    readonly statusCode: number;
    readonly headers: Record<string, string>;
    readonly body?: any;
    readonly duration: number;
}

export interface Middleware {
    (req: IncomingMessage, res: ServerResponse, context: RequestContext, next: () => Promise<void>): Promise<void>;
}

export interface Controller {
    handle(context: RequestContext): Promise<ResponseContext>;
}

export interface Route {
    readonly method: HttpMethod;
    readonly path: string;
    readonly controller: Controller;
    // Change this to handle exactOptionalPropertyTypes properly
    readonly middleware?: Middleware[] | undefined;
}

export interface ErrorResponse {
    readonly error: string;
    readonly status: number;
    readonly timestamp: number;
    readonly path?: string;
}

export interface SuccessResponse<T = any> {
    readonly data: T;
    readonly status: number;
    readonly timestamp: number;
}

export interface RateLimitEntry {
    requests: number;
    windowStart: number;
    lastRequest: number;
}

export interface LogEntry {
    readonly timestamp: number;
    readonly ip: string;
    readonly method: string;
    readonly path: string;
    readonly userAgent: string;
    readonly success: boolean;
    // Change these to handle exactOptionalPropertyTypes properly
    readonly error?: string | undefined;
    readonly duration?: number | undefined;
    readonly statusCode?: number | undefined;
}