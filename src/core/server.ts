/**
 * Main server class with clean separation of concerns
 */

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import { ApplicationConfig } from '../types/config';
import { Router } from '../routes/router';
import { LoggingService } from '../services/logging-service';

export class Server {
    private config: ApplicationConfig;
    private router: Router;
    private logger: LoggingService;
    private server: http.Server | https.Server;
    private startTime: number;
    private isListening = false;

    constructor(config: ApplicationConfig, router: Router, logger: LoggingService) {
        this.config = config;
        this.router = router;
        this.logger = logger;
        this.startTime = Date.now();

        this.server = this.createServer();
        this.setupGracefulShutdown();
    }

    /**
     * Create HTTP or HTTPS server based on configuration
     */
    private createServer(): http.Server | https.Server {
        const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
            // Set default security headers before router handles the request
            this.setDefaultSecurityHeaders(res);
            this.router.handleRequest(req, res);
        };

        if (this.config.server.enableHttps) {
            const options = {
                key: fs.readFileSync(this.config.server.httpsKeyPath!),
                cert: fs.readFileSync(this.config.server.httpsCertPath!),
            };
            return https.createServer(options, handler);
        } else {
            return http.createServer(handler);
        }
    }

    /**
     * Set default security headers on all responses
     */
    private setDefaultSecurityHeaders(res: http.ServerResponse): void {
        // Basic security headers that should be on all responses
        res.setHeader('Server', 'SecureProxy/2.0.0');
        res.setHeader('X-Powered-By', ''); // Remove default header
    }

    /**
     * Setup graceful shutdown handlers
     */
    private setupGracefulShutdown(): void {
        const signals = ['SIGTERM', 'SIGINT'] as const;

        signals.forEach(signal => {
            process.on(signal, () => this.shutdown(signal));
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.logger.log(`💥 Uncaught Exception: ${error.message}`, 'error');
            this.logger.log(`Stack: ${error.stack}`, 'error');
            this.shutdown('UNCAUGHT_EXCEPTION');
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.log(`💥 Unhandled Rejection at: ${promise}, reason: ${reason}`, 'error');
            this.shutdown('UNHANDLED_REJECTION');
        });
    }

    /**
     * Start the server
     */
    public async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.isListening) {
                resolve();
                return;
            }

            this.server.listen(this.config.server.port, this.config.server.host, (error?: Error) => {
                if (error) {
                    this.logger.log(`❌ Failed to start server: ${error.message}`, 'error');
                    reject(error);
                    return;
                }

                this.isListening = true;
                const protocol = this.config.server.enableHttps ? 'https' : 'http';
                const url = `${protocol}://${this.config.server.host}:${this.config.server.port}`;

                this.logger.log(`🚀 Secure Trakt Proxy listening on ${url}`, 'info');
                this.logServerInfo();
                this.logSecurityFeatures();
                this.logEnvironmentInfo();

                resolve();
            });

            this.server.on('error', (error: NodeJS.ErrnoException) => {
                this.isListening = false;

                if (error.code === 'EADDRINUSE') {
                    this.logger.log(`❌ Port ${this.config.server.port} is already in use`, 'error');
                } else if (error.code === 'EACCES') {
                    this.logger.log(`❌ Permission denied to bind to port ${this.config.server.port}`, 'error');
                } else {
                    this.logger.log(`❌ Server error: ${error.message}`, 'error');
                }

                reject(error);
            });

            // Handle server connection events
            this.server.on('connection', (socket) => {
                // Set timeout for idle connections
                socket.setTimeout(60000); // 60 seconds

                socket.on('timeout', () => {
                    this.logger.log('⏰ Socket timeout, closing connection', 'debug');
                    socket.destroy();
                });
            });

            // Handle client errors
            this.server.on('clientError', (error, socket) => {
                this.logger.log(`⚠️ Client error: ${error.message}`, 'warn');

                if (!socket.destroyed) {
                    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
                }
            });
        });
    }

    /**
     * Log server information
     */
    private logServerInfo(): void {
        const address = this.server.address();
        let serverInfo = 'Server started';

        if (address && typeof address === 'object') {
            serverInfo += ` on ${address.address}:${address.port}`;
        }

        this.logger.log(`📊 ${serverInfo}`, 'info');

        // Log route information
        const routeStats = this.router.getRouteStats();
        this.logger.log(`🛤️ ${routeStats.total} routes registered, ${routeStats.globalMiddleware} global middleware`, 'info');
    }

    /**
     * Log enabled security features
     */
    private logSecurityFeatures(): void {
        this.logger.log('🔐 Security features enabled:', 'info');
        this.logger.log('   ✓ Enhanced rate limiting with bot detection', 'info');
        this.logger.log('   ✓ Request authentication with timing-safe comparison', 'info');
        this.logger.log('   ✓ Advanced CORS protection', 'info');
        this.logger.log('   ✓ Comprehensive security headers', 'info');
        this.logger.log('   ✓ Detailed request logging and monitoring', 'info');
        this.logger.log('   ✓ IP masking for privacy', 'info');
        this.logger.log('   ✓ Token caching with TTL', 'info');
        this.logger.log('   ✓ Token refresh support', 'info');
        this.logger.log('   ✓ Device code flow support', 'info');
        this.logger.log('   ✓ Graceful error handling', 'info');
        this.logger.log('   ✓ Automatic maintenance and cleanup', 'info');
    }

    /**
     * Log environment information
     */
    private logEnvironmentInfo(): void {
        this.logger.log(`📊 Environment: ${this.config.server.environment.toUpperCase()}`, 'info');
        this.logger.log(`🔧 Node.js: ${process.version}`, 'info');
        this.logger.log(`💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`, 'info');
        this.logger.log(`⚡ PID: ${process.pid}`, 'info');

        if (this.config.server.enableHttps) {
            this.logger.log('🔒 HTTPS enabled', 'info');
        } else {
            this.logger.log('⚠️ HTTP mode (consider enabling HTTPS for production)', 'warn');
        }

        if (this.config.server.environment === 'production') {
            this.logger.log('🚀 Production mode - enhanced security active', 'info');
        } else {
            this.logger.log('🔧 Development mode - detailed logging enabled', 'info');
        }
    }

    /**
     * Stop the server gracefully
     */
    public async stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.isListening) {
                resolve();
                return;
            }

            this.logger.log('🛑 Stopping server...', 'info');

            // Stop accepting new connections
            this.server.close((error) => {
                this.isListening = false;

                if (error) {
                    this.logger.log(`❌ Error stopping server: ${error.message}`, 'error');
                    reject(error);
                } else {
                    this.logger.log('✅ Server stopped gracefully', 'info');
                    resolve();
                }
            });

            // Force close after timeout
            setTimeout(() => {
                this.logger.log('⏰ Force closing server after timeout', 'warn');
                this.isListening = false;
                reject(new Error('Server stop timeout'));
            }, 10000);
        });
    }

    /**
     * Graceful shutdown handler
     */
    private async shutdown(signal: string): Promise<void> {
        this.logger.log(`🛑 Shutting down server... (${signal})`, 'info');

        try {
            await this.stop();
            this.logger.close();
            process.exit(0);
        } catch (error) {
            this.logger.log(`❌ Error during shutdown: ${error}`, 'error');
            process.exit(1);
        }
    }

    /**
     * Get server information
     */
    public getInfo(): {
        uptime: number;
        startTime: number;
        port: number;
        host: string;
        protocol: string;
        environment: string;
        isListening: boolean;
        pid: number;
    } {
        return {
            uptime: Date.now() - this.startTime,
            startTime: this.startTime,
            port: this.config.server.port,
            host: this.config.server.host,
            protocol: this.config.server.enableHttps ? 'https' : 'http',
            environment: this.config.server.environment,
            isListening: this.isListening,
            pid: process.pid,
        };
    }

    /**
     * Check if server is running
     */
    public isRunning(): boolean {
        return this.isListening;
    }

    /**
     * Get server address
     */
    public getAddress(): string | null {
        const address = this.server.address();
        if (!address) return null;

        if (typeof address === 'string') {
            return address;
        }

        const protocol = this.config.server.enableHttps ? 'https' : 'http';
        return `${protocol}://${address.address}:${address.port}`;
    }

    /**
     * Get connection count (if available)
     */
    public getConnections(): Promise<number> {
        return new Promise((resolve, reject) => {
            if ('getConnections' in this.server) {
                (this.server as any).getConnections((error: Error | null, count: number) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(count);
                    }
                });
            } else {
                resolve(0);
            }
        });
    }

    /**
     * Force close all connections
     */
    public forceClose(): void {
        this.logger.log('⚠️ Force closing server', 'warn');

        if ('closeAllConnections' in this.server) {
            (this.server as any).closeAllConnections();
        }

        this.isListening = false;
    }
}