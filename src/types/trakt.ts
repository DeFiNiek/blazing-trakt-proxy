/**
 * Trakt API type definitions
 */

export interface TraktTokenResponse {
    readonly access_token: string;
    readonly refresh_token?: string;
    readonly expires_in?: number;
    readonly token_type?: string;
    readonly scope?: string;
    readonly created_at?: number;
}

export interface CachedToken extends TraktTokenResponse {
    readonly cached_at: number;
    readonly expires_at: number;
}

export interface TokenExchangeRequest {
    readonly auth_code: string;
    readonly client_id: string;
    readonly redirect_uri?: string;
}

export interface TokenRefreshRequest {
    readonly refresh_token: string;
    readonly client_id: string;
}

export interface DeviceTokenRequest {
    readonly device_code: string;
    readonly client_id: string;
}

export interface TokenResponse {
    readonly access_token: string;
    readonly refresh_token?: string;
    readonly expires_in?: number;
    readonly token_type?: string;
    readonly scope?: string;
    readonly from_cache?: boolean;
}

export interface TraktApiError {
    readonly error: string;
    readonly error_description?: string;
}

export interface TraktRequestOptions {
    readonly method: 'GET' | 'POST';
    readonly path: string;
    readonly data?: any;
    readonly timeout?: number;
}