/**
 * Dependency injection container with database support
 */

import { ApplicationConfig } from '../types/config';
import { ConfigLoader } from '../utils/config-loader';
import { LoggingService } from '../services/logging-service';
import { RateLimitService } from '../services/ratelimit-service';
import { TokenCacheService } from '../services/token-cache-service';
import { TraktService } from '../services/trakt-service';
import { DatabaseManager } from '../services/database';
import { AuthMiddleware } from '../middleware/auth-middleware';
import { CorsMiddleware } from '../middleware/cors-middleware';
import { RateLimitMiddleware } from '../middleware/ratelimit-middleware';
import { SecurityMiddleware } from '../middleware/security-middleware';
import { TraktController } from '../controllers/trakt-controller';
import { HealthController } from '../controllers/health-controller';
import { Router } from '../routes/router';
import { setupRoutes } from '../routes';

export interface ServiceContainer {
    // Configuration
    config: ApplicationConfig;

    // Database
    databaseManager?: DatabaseManager;

    // Core Services
    logger: LoggingService;
    rateLimitService: RateLimitService;
    tokenCacheService: TokenCacheService;
    traktService: TraktService;

    // Middleware
    authMiddleware: AuthMiddleware;
    corsMiddleware: CorsMiddleware;
    rateLimitMiddleware: RateLimitMiddleware;
    securityMiddleware: SecurityMiddleware;

    // Controllers
    traktController: TraktController;
    healthController: HealthController;

    // Router
    router: Router;
}

export class Container {
    private static instance: Container;
    private services: Partial<ServiceContainer> = {};
    private isInitialized = false;

    private constructor() { }

    public static getInstance(): Container {
        if (!Container.instance) {
            Container.instance = new Container();
        }
        return Container.instance;
    }

    /**
     * Initialize all services and their dependencies
     */
    public async initialize(): Promise<ServiceContainer> {
        if (this.isInitialized) {
            return this.services as ServiceContainer;
        }

        try {
            // Load configuration first
            await this.initializeConfig();

            // Initialize database (optional)
            await this.initializeDatabase();

            // Initialize services in dependency order
            await this.initializeServices();
            await this.initializeMiddleware();
            await this.initializeControllers();
            await this.initializeRouter();

            // Validate all dependencies are properly initialized
            this.validateDependencies();

            this.isInitialized = true;
            this.services.logger!.log('✅ Dependency injection container initialized', 'info');

            return this.services as ServiceContainer;
        } catch (error) {
            console.error('❌ Failed to initialize container:', error);
            throw error;
        }
    }

    /**
     * Get a specific service from the container
     */
    public get<K extends keyof ServiceContainer>(serviceName: K): ServiceContainer[K] {
        if (!this.isInitialized) {
            throw new Error('Container not initialized. Call initialize() first.');
        }

        const service = this.services[serviceName];
        if (!service) {
            throw new Error(`Service '${serviceName}' not found in container`);
        }

        return service;
    }

    /**
     * Get all services
     */
    public getAll(): ServiceContainer {
        if (!this.isInitialized) {
            throw new Error('Container not initialized. Call initialize() first.');
        }

        return this.services as ServiceContainer;
    }

    /**
     * Check if container is initialized
     */
    public isReady(): boolean {
        return this.isInitialized;
    }

    /**
     * Cleanup resources
     */
    public async cleanup(): Promise<void> {
        if (!this.isInitialized) {
            return;
        }

        try {
            // Cleanup services that need it
            if (this.services.rateLimitService) {
                this.services.rateLimitService.destroy();
            }

            if (this.services.tokenCacheService) {
                this.services.tokenCacheService.destroy();
            }

            // Cleanup database last
            if (this.services.databaseManager) {
                await this.services.databaseManager.cleanup();
            }

            if (this.services.logger) {
                this.services.logger.close();
            }

            this.services.logger?.log('🧹 Container cleanup completed', 'info');
        } catch (error) {
            console.error('❌ Error during container cleanup:', error);
        }

        this.isInitialized = false;
        this.services = {};
    }

    /**
     * Initialize configuration
     */
    private async initializeConfig(): Promise<void> {
        const configLoader = ConfigLoader.getInstance();
        this.services.config = configLoader.loadConfig();

        console.log('🔧 Configuration loaded');
    }

    /**
     * Initialize database (optional)
     */
    private async initializeDatabase(): Promise<void> {
        const config = this.services.config!;

        if (config.database.type !== 'memory') {
            try {
                this.services.databaseManager = new DatabaseManager(config.database);
                await this.services.databaseManager.initialize();

                console.log(`💾 Database initialized: ${config.database.type}`);
            } catch (error) {
                console.warn(`⚠️ Database initialization failed, falling back to memory: ${error}`);
                // Database will be undefined, services will use memory fallback
            }
        } else {
            console.log('🧠 Using in-memory storage (no database configured)');
        }
    }

    /**
     * Initialize core services
     */
    private async initializeServices(): Promise<void> {
        const config = this.services.config!;
        const database = this.services.databaseManager?.getAdapter();

        // Logger (no dependencies)
        this.services.logger = new LoggingService(config.logging);

        // Rate Limit Service (depends on logger, optionally database)
        this.services.rateLimitService = new RateLimitService(
            config.security,
            this.services.logger,
            database
        );

        // Token Cache Service (depends on logger, optionally database)
        this.services.tokenCacheService = new TokenCacheService(
            config.security,
            this.services.logger,
            database
        );

        // Trakt Service (depends on logger)
        this.services.traktService = new TraktService(
            config.trakt,
            this.services.logger
        );

        this.services.logger.log('🔧 Core services initialized', 'debug');
    }

    /**
     * Initialize middleware
     */
    private async initializeMiddleware(): Promise<void> {
        const config = this.services.config!;
        const logger = this.services.logger!;

        // Auth Middleware
        this.services.authMiddleware = new AuthMiddleware(
            config.security,
            logger
        );

        // CORS Middleware
        this.services.corsMiddleware = new CorsMiddleware(
            config.security,
            config.server,
            logger
        );

        // Rate Limit Middleware
        this.services.rateLimitMiddleware = new RateLimitMiddleware(
            this.services.rateLimitService!,
            logger
        );

        // Security Middleware
        this.services.securityMiddleware = new SecurityMiddleware(
            config.server,
            logger
        );

        this.services.logger!.log('🛡️ Middleware initialized', 'debug');
    }

    /**
     * Initialize controllers
     */
    private async initializeControllers(): Promise<void> {
        const logger = this.services.logger!;

        // Trakt Controller
        this.services.traktController = new TraktController(
            this.services.traktService!,
            this.services.tokenCacheService!,
            logger
        );

        // Health Controller (now includes database manager)
        this.services.healthController = new HealthController(
            this.services.config!,
            logger,
            this.services.rateLimitService!,
            this.services.tokenCacheService!,
            this.services.traktService!,
            this.services.databaseManager  // Pass database manager for health checks
        );

        this.services.logger!.log('🎮 Controllers initialized', 'debug');
    }

    /**
     * Initialize router with routes
     */
    private async initializeRouter(): Promise<void> {
        this.services.router = setupRoutes({
            traktController: this.services.traktController!,
            healthController: this.services.healthController!,
            authMiddleware: this.services.authMiddleware!,
            corsMiddleware: this.services.corsMiddleware!,
            rateLimitMiddleware: this.services.rateLimitMiddleware!,
            securityMiddleware: this.services.securityMiddleware!,
            logger: this.services.logger!,
        });

        this.services.logger!.log('🛤️ Router initialized', 'debug');
    }

    /**
     * Validate service dependencies
     */
    private validateDependencies(): void {
        const requiredServices: (keyof ServiceContainer)[] = [
            'config',
            'logger',
            'rateLimitService',
            'tokenCacheService',
            'traktService',
            'authMiddleware',
            'corsMiddleware',
            'rateLimitMiddleware',
            'securityMiddleware',
            'traktController',
            'healthController',
            'router',
        ];

        const missing = requiredServices.filter(service => !this.services[service]);

        if (missing.length > 0) {
            throw new Error(`Missing required services: ${missing.join(', ')}`);
        }

        // Database manager is optional
        if (!this.services.databaseManager) {
            this.services.logger!.log('💡 Database manager not initialized - using memory storage', 'info');
        }
    }

    /**
     * Get container statistics
     */
    public getStats(): {
        initialized: boolean;
        serviceCount: number;
        services: string[];
        memoryUsage: NodeJS.MemoryUsage;
        databaseConnected: boolean;
        databaseType: string;
    } {
        return {
            initialized: this.isInitialized,
            serviceCount: Object.keys(this.services).length,
            services: Object.keys(this.services),
            memoryUsage: process.memoryUsage(),
            databaseConnected: !!this.services.databaseManager,
            databaseType: this.services.config?.database.type || 'none',
        };
    }

    /**
     * Get database information
     */
    public async getDatabaseInfo(): Promise<any> {
        if (!this.services.databaseManager) {
            return {
                type: 'memory',
                connected: false,
                healthy: true,
                message: 'Using in-memory storage',
            };
        }

        try {
            return await this.services.databaseManager.getDatabaseInfo();
        } catch (error) {
            return {
                type: this.services.config?.database.type || 'unknown',
                connected: false,
                healthy: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Perform container maintenance
     */
    public async performMaintenance(): Promise<{
        databaseMaintenance?: any;
        memoryCleanup: boolean;
        containerStats: any;
    }> {
        const results: any = {
            memoryCleanup: true,
            containerStats: this.getStats(),
        };

        // Perform database maintenance if available
        if (this.services.databaseManager) {
            try {
                results.databaseMaintenance = await this.services.databaseManager.performMaintenance();
            } catch (error) {
                results.databaseMaintenance = {
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        }

        // Trigger manual cleanup in services
        if (global.gc) {
            global.gc();
            this.services.logger?.log('🧹 Manual garbage collection triggered', 'debug');
        }

        return results;
    }

    /**
     * Create a new container instance (for testing)
     */
    public static createTestContainer(): Container {
        return new Container();
    }

    /**
     * Reset the singleton instance (for testing)
     */
    public static reset(): void {
        if (Container.instance) {
            Container.instance.cleanup();
            Container.instance = undefined as any;
        }
    }
}