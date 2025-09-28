/**
 * Application bootstrap and main orchestrator
 */

import { Container, ServiceContainer } from './container';
import { Server } from './server';

export class Application {
    private container: Container;
    private services: ServiceContainer | null = null;
    private server: Server | null = null;
    private isStarted = false;

    constructor() {
        this.container = Container.getInstance();
    }

    /**
     * Initialize the application
     */
    public async initialize(): Promise<void> {
        if (this.services) {
            return; // Already initialized
        }

        try {
            // Initialize dependency injection container
            this.services = await this.container.initialize();

            // Create server instance
            this.server = new Server(
                this.services.config,
                this.services.router,
                this.services.logger
            );

            this.services.logger.log('🏗️ Application initialized successfully', 'info');
        } catch (error) {
            console.error('❌ Failed to initialize application:', error);
            throw error;
        }
    }

    /**
     * Start the application
     */
    public async start(): Promise<void> {
        if (this.isStarted) {
            return; // Already started
        }

        if (!this.services || !this.server) {
            await this.initialize();
        }

        try {
            // Start the server
            await this.server!.start();

            // Perform startup checks
            await this.performStartupChecks();

            this.isStarted = true;
            this.services!.logger.log('✅ Application started successfully', 'info');

            // Log useful information
            this.logStartupInfo();

        } catch (error) {
            this.services!.logger.log(`❌ Failed to start application: ${error}`, 'error');
            throw error;
        }
    }

    /**
     * Stop the application gracefully
     */
    public async stop(): Promise<void> {
        if (!this.isStarted) {
            return; // Not started
        }

        try {
            this.services!.logger.log('🛑 Stopping application...', 'info');

            // Stop server
            if (this.server) {
                await this.server.stop();
            }

            // Cleanup container
            await this.container.cleanup();

            this.isStarted = false;
            console.log('✅ Application stopped gracefully');

        } catch (error) {
            console.error('❌ Error stopping application:', error);
            throw error;
        }
    }

    /**
     * Perform startup health checks
     */
    private async performStartupChecks(): Promise<void> {
        const logger = this.services!.logger;
        logger.log('🔍 Performing startup checks...', 'info');

        // Test Trakt API connectivity
        try {
            const traktController = this.services!.traktController;
            const connectionTest = await traktController.testTraktConnection();

            if (connectionTest.connected) {
                logger.log('✅ Trakt API connectivity: OK', 'info');
            } else {
                logger.log(`⚠️ Trakt API connectivity: Failed - ${connectionTest.error}`, 'warn');
            }
        } catch (error) {
            logger.log(`⚠️ Trakt API test failed: ${error}`, 'warn');
        }

        // Validate CORS configuration
        const corsValidation = this.services!.corsMiddleware.validateOriginConfiguration();
        if (!corsValidation.valid) {
            logger.log('⚠️ CORS configuration issues detected:', 'warn');
            corsValidation.warnings.forEach(warning =>
                logger.log(`   - ${warning}`, 'warn')
            );

            if (corsValidation.recommendations.length > 0) {
                logger.log('💡 CORS recommendations:', 'info');
                corsValidation.recommendations.forEach(rec =>
                    logger.log(`   - ${rec}`, 'info')
                );
            }
        } else {
            logger.log('✅ CORS configuration: OK', 'info');
        }

        // Check memory usage
        const memUsage = process.memoryUsage();
        const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
        logger.log(`💾 Initial memory usage: ${memUsedMB}MB / ${memTotalMB}MB`, 'info');

        // Validate environment variables
        const config = this.services!.config;
        if (config.server.environment === 'production') {
            logger.log('🔒 Production environment - validating security settings...', 'info');

            if (!config.server.enableHttps) {
                logger.log('⚠️ HTTPS not enabled in production', 'warn');
            }

            if (config.security.allowedOrigins.includes('*')) {
                logger.log('⚠️ Wildcard CORS origins in production', 'warn');
            }
        }

        logger.log('✅ Startup checks completed', 'info');
    }

    /**
     * Log startup information
     */
    private logStartupInfo(): void {
        const logger = this.services!.logger;
        const serverInfo = this.server!.getInfo();
        const config = this.services!.config;

        logger.log('', 'info');
        logger.log('🎉 Blazing Helper Trakt Proxy is ready!', 'info');
        logger.log('', 'info');

        const protocol = serverInfo.protocol;
        const baseUrl = `${protocol}://${serverInfo.host}:${serverInfo.port}`;

        logger.log('📡 Available endpoints:', 'info');
        logger.log(`   Health: ${baseUrl}/health`, 'info');
        // REMOVED: Status endpoint reference
        logger.log(`   Metrics: ${baseUrl}/metrics`, 'info');
        logger.log('', 'info');

        logger.log('🔐 Trakt OAuth endpoints (require API key):', 'info');
        logger.log(`   Token Exchange: POST ${baseUrl}/trakt/exchange-token`, 'info');
        logger.log(`   Token Refresh: POST ${baseUrl}/trakt/refresh-token`, 'info');
        logger.log(`   Device Token: POST ${baseUrl}/trakt/device-token`, 'info');
        logger.log(`   Revoke Token: POST ${baseUrl}/trakt/revoke-token`, 'info');
        logger.log('', 'info');

        logger.log('📋 Configuration summary:', 'info');
        logger.log(`   Environment: ${config.server.environment}`, 'info');
        logger.log(`   HTTPS: ${config.server.enableHttps ? 'Enabled' : 'Disabled'}`, 'info');
        logger.log(`   Rate Limit: ${config.security.rateLimitMaxRequests} req/${config.security.rateLimitWindowMs}ms`, 'info');
        logger.log(`   CORS Origins: ${config.security.allowedOrigins.length} configured`, 'info');
        logger.log('', 'info');
    }

    /**
     * Get application status
     */
    public getStatus(): {
        running: boolean;
        initialized: boolean;
        uptime: number;
        config: any;
        services: any;
        server: any;
    } {
        const serverInfo = this.server?.getInfo();
        const containerStats = this.container.getStats();

        return {
            running: this.isStarted,
            initialized: this.services !== null,
            uptime: serverInfo?.uptime || 0,

            config: this.services ? {
                environment: this.services.config.server.environment,
                port: this.services.config.server.port,
                enableHttps: this.services.config.server.enableHttps,
                allowedOrigins: this.services.config.security.allowedOrigins.length,
            } : null,

            services: {
                containerStats,
                cache: this.services?.tokenCacheService.getCacheStats(),
                rateLimit: this.services?.rateLimitService.getStats(),
                logging: this.services?.logger.getLogStats(),
            },

            server: serverInfo,
        };
    }

    /**
     * Get the dependency injection container
     */
    public getContainer(): Container {
        return this.container;
    }

    /**
     * Get all services (for testing or advanced usage)
     */
    public getServices(): ServiceContainer | null {
        return this.services;
    }

    /**
     * Run safe application diagnostics
     * Uses the safe public method instead of accessing private diagnostics
     */
    public async runDiagnostics(): Promise<any> {
        if (!this.services) {
            throw new Error('Application not initialized');
        }

        // Use the safe public diagnostics method
        return await this.services.healthController.getApplicationDiagnostics();
    }

    /**
     * Get application metrics
     */
    public getMetrics(): any {
        if (!this.services) {
            return null;
        }

        return this.services.healthController.getQuickMetrics();
    }

    /**
     * Restart the application
     */
    public async restart(): Promise<void> {
        this.services!.logger.log('🔄 Restarting application...', 'info');

        await this.stop();

        // Reset container to reload configuration
        Container.reset();
        this.container = Container.getInstance();
        this.services = null;
        this.server = null;

        await this.start();
    }

    /**
     * Check if application is healthy
     */
    public async isHealthy(): Promise<boolean> {
        if (!this.isStarted || !this.services) {
            return false;
        }

        try {
            // Use safe diagnostics to check health
            const diagnostics = await this.runDiagnostics();
            return diagnostics.healthy;
        } catch {
            return false;
        }
    }
}