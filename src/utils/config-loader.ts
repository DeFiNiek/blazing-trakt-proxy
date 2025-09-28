/**
 * Configuration loader with validation and environment support
 * FIXED: Enhanced .env loading with better error handling and debugging
 */

import * as fs from 'fs';
import * as path from 'path';
import { ApplicationConfig, EnvVariables, ServerConfig } from '../types/config';
import { DatabaseConfigLoader } from './database-config-loader';

export class ConfigLoader {
    private static instance: ConfigLoader;
    private config: ApplicationConfig | null = null;

    private constructor() { }

    public static getInstance(): ConfigLoader {
        if (!ConfigLoader.instance) {
            ConfigLoader.instance = new ConfigLoader();
        }
        return ConfigLoader.instance;
    }

    public loadConfig(): ApplicationConfig {
        if (this.config) {
            return this.config;
        }

        // CRITICAL: Load .env file FIRST, before creating config
        this.loadEnvFile();
        this.config = this.createConfig();
        this.validateConfig(this.config);

        return this.config;
    }

    private loadEnvFile(): void {
        const envPath = path.resolve('.env');

        console.log('🔍 ConfigLoader: Looking for .env at:', envPath);

        if (!fs.existsSync(envPath)) {
            console.warn('⚠️ ConfigLoader: No .env file found at:', envPath);
            console.warn('⚠️ ConfigLoader: Will use existing environment variables only');
            return;
        }

        try {
            console.log('📄 ConfigLoader: Loading .env file...');
            const envContent = fs.readFileSync(envPath, 'utf8');
            const lines = envContent.split('\n');
            let loadedCount = 0;

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;

                const equalIndex = trimmed.indexOf('=');
                if (equalIndex === -1) continue;

                const key = trimmed.substring(0, equalIndex).trim();
                let value = trimmed.substring(equalIndex + 1).trim();

                // Remove quotes
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }

                // Don't override existing environment variables
                if (!process.env[key]) {
                    process.env[key] = value;
                    loadedCount++;

                    // Log critical variables (but mask sensitive values)
                    if (['TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET', 'API_KEY_HASH'].includes(key)) {
                        console.log(`✅ ConfigLoader: Loaded ${key} (${value.length} chars)`);
                    }
                } else {
                    console.log(`⭐️ ConfigLoader: Skipped ${key} (already set in environment)`);
                }
            }

            console.log(`✅ ConfigLoader: Successfully loaded ${loadedCount} variables from .env`);

            // Verify critical variables were loaded
            const criticalVars = ['TRAKT_CLIENT_ID', 'TRAKT_CLIENT_SECRET', 'API_KEY_HASH'];
            const stillMissing = criticalVars.filter(key => !process.env[key]);

            if (stillMissing.length > 0) {
                console.error(`❌ ConfigLoader: Critical variables still missing after .env load: ${stillMissing.join(', ')}`);
            } else {
                console.log('✅ ConfigLoader: All critical variables loaded successfully');
            }

        } catch (error) {
            console.error(`❌ ConfigLoader: Failed to load .env file: ${error}`);
            throw new Error(`Failed to load .env file: ${error}`);
        }
    }

    private createConfig(): ApplicationConfig {
        const env = process.env as EnvVariables;
        const isDevelopment = env.NODE_ENV !== 'production';

        console.log('🔧 ConfigLoader: Creating configuration...');
        console.log(`🔧 ConfigLoader: NODE_ENV = ${env.NODE_ENV || 'undefined'}`);

        // Debug: Show what we have for critical variables
        console.log('🔧 ConfigLoader: Critical variables check:');
        console.log(`  TRAKT_CLIENT_ID: ${env.TRAKT_CLIENT_ID ? 'SET (' + env.TRAKT_CLIENT_ID.length + ' chars)' : 'NOT SET'}`);
        console.log(`  TRAKT_CLIENT_SECRET: ${env.TRAKT_CLIENT_SECRET ? 'SET (' + env.TRAKT_CLIENT_SECRET.length + ' chars)' : 'NOT SET'}`);
        console.log(`  API_KEY_HASH: ${env.API_KEY_HASH ? 'SET (' + env.API_KEY_HASH.length + ' chars)' : 'NOT SET'}`);

        // Create server config with proper optional property handling
        const serverConfig: ServerConfig = {
            port: parseInt(env.PORT || '3000'),
            host: env.HOST || '0.0.0.0',
            environment: isDevelopment ? 'development' : 'production',
            enableHttps: env.ENABLE_HTTPS === 'true',
            maxRequestBodySize: parseInt(env.MAX_REQUEST_BODY_SIZE || '2048'),
            enableDetailedLogging: env.ENABLE_DETAILED_LOGGING === 'true' || isDevelopment,
        };

        // Only add optional properties if they have values
        if (env.HTTPS_KEY_PATH !== undefined) {
            (serverConfig as any).httpsKeyPath = env.HTTPS_KEY_PATH;
        }
        if (env.HTTPS_CERT_PATH !== undefined) {
            (serverConfig as any).httpsCertPath = env.HTTPS_CERT_PATH;
        }

        const config = {
            server: serverConfig,
            trakt: {
                clientId: env.TRAKT_CLIENT_ID || '',
                clientSecret: env.TRAKT_CLIENT_SECRET || '',
            },
            security: {
                apiKeyHash: env.API_KEY_HASH || '',
                allowedOrigins: this.parseAllowedOrigins(env.ALLOWED_ORIGINS),
                rateLimitWindowMs: parseInt(env.RATE_LIMIT_WINDOW_MS || '60000'),
                rateLimitMaxRequests: parseInt(env.RATE_LIMIT_MAX_REQUESTS || '20'),
                tokenCacheTtl: parseInt(env.TOKEN_CACHE_TTL || '3600'),
            },
            logging: {
                enableDetailedLogging: env.ENABLE_DETAILED_LOGGING === 'true' || isDevelopment,
                logDirectory: 'logs',
                maxLogFiles: 10,
                maxLogAge: '7d',
            },
            database: DatabaseConfigLoader.loadDatabaseConfig(),
        };

        console.log('✅ ConfigLoader: Configuration created successfully');
        return config;
    }

    private parseAllowedOrigins(origins?: string): string[] {
        if (!origins) {
            return ['http://localhost', 'https://localhost'];
        }
        return origins.split(',').map(origin => origin.trim());
    }

    private validateConfig(config: ApplicationConfig): void {
        const errors: string[] = [];

        console.log('🔍 ConfigLoader: Validating configuration...');

        // Required fields
        if (!config.trakt.clientId) {
            errors.push('TRAKT_CLIENT_ID is required');
        }
        if (!config.trakt.clientSecret) {
            errors.push('TRAKT_CLIENT_SECRET is required');
        }
        if (!config.security.apiKeyHash) {
            errors.push('API_KEY_HASH is required');
        }

        // Validate API key hash format
        if (config.security.apiKeyHash && config.security.apiKeyHash.length !== 64) {
            errors.push('API_KEY_HASH must be 64 characters (SHA-256)');
        }

        // Validate HTTPS configuration
        if (config.server.enableHttps) {
            if (!config.server.httpsKeyPath || !config.server.httpsCertPath) {
                errors.push('HTTPS enabled but certificate paths not provided');
            }

            if (config.server.httpsKeyPath && !fs.existsSync(config.server.httpsKeyPath)) {
                errors.push(`HTTPS key file not found: ${config.server.httpsKeyPath}`);
            }

            if (config.server.httpsCertPath && !fs.existsSync(config.server.httpsCertPath)) {
                errors.push(`HTTPS cert file not found: ${config.server.httpsCertPath}`);
            }
        }

        // Validate database configuration
        if (config.database.type === 'postgresql' && !config.database.connectionString) {
            errors.push('PostgreSQL connection string is required');
        }

        if (config.database.type === 'sqlite' && !config.database.filename) {
            errors.push('SQLite filename is required');
        }

        if (errors.length > 0) {
            console.error('❌ ConfigLoader: Configuration validation failed:');
            errors.forEach(error => console.error(`  • ${error}`));
            throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
        }

        console.log('✅ ConfigLoader: Configuration validated successfully');
    }

    public getConfig(): ApplicationConfig {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }
        return this.config;
    }
}