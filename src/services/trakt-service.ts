/**
 * Trakt API client service with comprehensive error handling and retry logic
 */

import * as https from 'https';
import { TraktConfig } from '../types/config';
import { TraktTokenResponse, TraktApiError, TraktRequestOptions } from '../types/trakt';
import { LoggingService } from './logging-service';

export class TraktService {
    private config: TraktConfig;
    private logger: LoggingService;
    private readonly apiBase = 'api.trakt.tv';
    private readonly userAgent = 'Blazing Helper Secure Proxy/2.0.0';
    private requestCount = 0;

    constructor(config: TraktConfig, logger: LoggingService) {
        this.config = config;
        this.logger = logger;
    }

    public async exchangeToken(authCode: string, redirectUri: string = 'urn:ietf:wg:oauth:2.0:oob'): Promise<TraktTokenResponse> {
        return this.makeRequest({
            method: 'POST',
            path: '/oauth/token',
            data: {
                code: authCode,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            },
        });
    }

    public async refreshToken(refreshToken: string): Promise<TraktTokenResponse> {
        return this.makeRequest({
            method: 'POST',
            path: '/oauth/token',
            data: {
                refresh_token: refreshToken,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                grant_type: 'refresh_token',
            },
        });
    }

    public async exchangeDeviceToken(deviceCode: string): Promise<TraktTokenResponse> {
        return this.makeRequest({
            method: 'POST',
            path: '/oauth/device/token',
            data: {
                code: deviceCode,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
            },
        });
    }

    public async revokeToken(accessToken: string): Promise<void> {
        await this.makeRequest({
            method: 'POST',
            path: '/oauth/revoke',
            data: {
                token: accessToken,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
            },
        });
    }

    private async makeRequest(options: TraktRequestOptions, retryCount: number = 0): Promise<TraktTokenResponse> {
        const { method, path, data, timeout = 15000 } = options;
        const maxRetries = 3;

        return new Promise((resolve, reject) => {
            const postData = data ? JSON.stringify(data) : '';
            this.requestCount++;

            const requestOptions = {
                hostname: this.apiBase,
                port: 443,
                path,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'trakt-api-version': '2',
                    'trakt-api-key': this.config.clientId,
                    'User-Agent': this.userAgent,
                    ...(postData && { 'Content-Length': Buffer.byteLength(postData) }),
                },
                timeout,
            };

            this.logger.log(`🔄 Trakt API request: ${method} ${path} (attempt ${retryCount + 1})`, 'debug');

            const req = https.request(requestOptions, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = responseData ? JSON.parse(responseData) : {};

                        if (res.statusCode === 200 || res.statusCode === 201) {
                            this.logger.log(`✅ Trakt API success: ${method} ${path} (${res.statusCode})`, 'debug');
                            resolve(response);
                        } else if (res.statusCode === 429 && retryCount < maxRetries) {
                            // Rate limited - retry with exponential backoff
                            const retryAfter = parseInt(res.headers['retry-after'] as string) || Math.pow(2, retryCount);
                            this.logger.log(`⏳ Trakt API rate limited, retrying after ${retryAfter}s`, 'warn');

                            setTimeout(() => {
                                this.makeRequest(options, retryCount + 1).then(resolve).catch(reject);
                            }, retryAfter * 1000);
                        } else if ((res.statusCode === 500 || res.statusCode === 502 || res.statusCode === 503) && retryCount < maxRetries) {
                            // Server error - retry with exponential backoff
                            const delay = Math.pow(2, retryCount) * 1000;
                            this.logger.log(`🔄 Trakt API server error ${res.statusCode}, retrying after ${delay}ms`, 'warn');

                            setTimeout(() => {
                                this.makeRequest(options, retryCount + 1).then(resolve).catch(reject);
                            }, delay);
                        } else {
                            const error = response as TraktApiError;
                            const errorMessage = `Trakt API error: ${res.statusCode} - ${error.error_description || error.error || 'Unknown error'}`;
                            this.logger.log(`❌ ${errorMessage}`, 'warn');
                            reject(new Error(errorMessage));
                        }
                    } catch (parseError) {
                        const errorMessage = `Invalid JSON response from Trakt: ${responseData.substring(0, 100)}`;
                        this.logger.log(`❌ ${errorMessage}`, 'error');
                        reject(new Error(errorMessage));
                    }
                });
            });

            req.on('error', (error) => {
                if (retryCount < maxRetries && this.isRetryableError(error)) {
                    const delay = Math.pow(2, retryCount) * 1000;
                    this.logger.log(`🔄 Trakt request error, retrying after ${delay}ms: ${error.message}`, 'warn');

                    setTimeout(() => {
                        this.makeRequest(options, retryCount + 1).then(resolve).catch(reject);
                    }, delay);
                } else {
                    const errorMessage = `Trakt request error: ${error.message}`;
                    this.logger.log(`❌ ${errorMessage}`, 'error');
                    reject(new Error(errorMessage));
                }
            });

            req.on('timeout', () => {
                req.destroy();
                if (retryCount < maxRetries) {
                    const delay = Math.pow(2, retryCount) * 1000;
                    this.logger.log(`⏰ Trakt request timeout, retrying after ${delay}ms`, 'warn');

                    setTimeout(() => {
                        this.makeRequest(options, retryCount + 1).then(resolve).catch(reject);
                    }, delay);
                } else {
                    const errorMessage = 'Trakt request timeout';
                    this.logger.log(`❌ ${errorMessage}`, 'error');
                    reject(new Error(errorMessage));
                }
            });

            if (postData) {
                req.write(postData);
            }
            req.end();
        });
    }

    private isRetryableError(error: Error): boolean {
        const retryableErrors = [
            'ECONNRESET',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'EAI_AGAIN',
        ];

        return retryableErrors.some(code => error.message.includes(code));
    }

    public async testConnection(): Promise<boolean> {
        try {
            // Make a simple request to test connectivity
            await this.makeRequest({
                method: 'GET',
                path: '/oauth/applications',
                timeout: 5000,
            });
            return true;
        } catch (error) {
            this.logger.log(`❌ Trakt connection test failed: ${error}`, 'warn');
            return false;
        }
    }

    public async validateClientCredentials(): Promise<{ valid: boolean; error?: string }> {
        try {
            // Try to get application info to validate credentials
            await this.makeRequest({
                method: 'GET',
                path: '/oauth/applications',
                timeout: 10000,
            });

            return { valid: true };
        } catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public getApiInfo(): {
        baseUrl: string;
        userAgent: string;
        clientId?: string; // Make optional
        requestCount: number;
    } {
        return {
            baseUrl: `https://${this.apiBase}`,
            userAgent: this.userAgent,
            // Remove clientId from public responses
            requestCount: this.requestCount,
        };
    }

    public getStats(): {
        totalRequests: number;
        baseUrl: string;
        clientId: string;
        connected: boolean;
    } {
        return {
            totalRequests: this.requestCount,
            baseUrl: `https://${this.apiBase}`,
            clientId: this.config.clientId,
            connected: true, // Would need actual connectivity check
        };
    }

    public async getApiStatus(): Promise<{
        online: boolean;
        responseTime?: number;
        version?: string;
        error?: string;
    }> {
        const startTime = Date.now();

        try {
            await this.testConnection();
            const responseTime = Date.now() - startTime;

            return {
                online: true,
                responseTime,
                version: '2', // Trakt API version
            };
        } catch (error) {
            return {
                online: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public resetRequestCount(): void {
        this.requestCount = 0;
        this.logger.log('🔄 Trakt request counter reset', 'debug');
    }
}