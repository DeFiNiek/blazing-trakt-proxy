#!/usr/bin/env node
/**
 * Blazing Helper - Ultra-Secure Trakt OAuth Proxy Server
 * Refactored with clean architecture and modular design
 * Production-ready with comprehensive security features
 */

import { Application } from './core/application';

async function main(): Promise<void> {
    console.log('🚀 Starting Blazing Helper Trakt Proxy...');
    console.log('');

    try {
        // REMOVED: The environment variable check is now handled by ConfigLoader
        // The Application class will load the configuration and validate it properly

        // Create and start application
        const app = new Application();

        // Initialize and start the application
        await app.start();

        // Display final startup message
        const status = app.getStatus();
        if (status.running && status.server) {
            const protocol = status.server.protocol;
            const url = `${protocol}://${status.server.host}:${status.server.port}`;

            console.log('');
            console.log('🎉 ================================');
            console.log('   SERVER READY FOR CONNECTIONS');
            console.log('🎉 ================================');
            console.log('');
            console.log(`🌐 Server URL: ${url}`);
            console.log(`📊 Environment: ${status.config?.environment?.toUpperCase() || 'unknown'}`);
            console.log(`🔐 Security: ${status.config?.enableHttps ? 'HTTPS Enabled' : 'HTTP Mode'}`);
            console.log('');
            console.log('📡 Quick Links:');
            console.log(`   Health Check: ${url}/health`);
            console.log(`   Server Status: ${url}/status`);
            console.log(`   Metrics: ${url}/metrics`);
            console.log('');
            console.log('💡 Use Ctrl+C to gracefully shutdown');
            console.log('');
        }

        // Setup graceful shutdown handlers
        const shutdown = async (signal: string) => {
            console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

            try {
                await app.stop();
                console.log('✅ Server shutdown complete');
                process.exit(0);
            } catch (error) {
                console.error('❌ Error during shutdown:', error);
                process.exit(1);
            }
        };

        // Handle shutdown signals
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        // Handle process warnings
        process.on('warning', (warning) => {
            console.warn('⚠️ Process Warning:', warning.name);
            console.warn('   Message:', warning.message);
            if (warning.stack) {
                console.warn('   Stack:', warning.stack);
            }
        });

    } catch (error) {
        console.error('');
        console.error('💥 Failed to start server:');
        console.error('');

        if (error instanceof Error) {
            console.error(`❌ Error: ${error.message}`);

            // Show helpful hints based on error type
            if (error.message.includes('EADDRINUSE')) {
                console.error('💡 Hint: Port is already in use. Try a different PORT in your .env file');
            } else if (error.message.includes('EACCES')) {
                console.error('💡 Hint: Permission denied. Try using a port number above 1024');
            } else if (error.message.includes('ENOTFOUND')) {
                console.error('💡 Hint: Check your network connection and DNS settings');
            } else if (error.message.includes('Configuration validation failed')) {
                console.error('💡 Hint: Check your .env file configuration');
                console.error('   Run: npm run security:setup');
            } else if (error.message.includes('TRAKT_CLIENT_ID') ||
                error.message.includes('TRAKT_CLIENT_SECRET') ||
                error.message.includes('API_KEY_HASH')) {
                console.error('💡 Hint: Environment variables not loaded properly');
                console.error('   1. Check that .env file exists and has correct values');
                console.error('   2. Try: source .env && npm start');
                console.error('   3. Or run: npm run security:setup');
            }

            // Show stack trace in development
            if (process.env.NODE_ENV === 'development' && error.stack) {
                console.error('');
                console.error('Stack trace:');
                console.error(error.stack);
            }
        } else {
            console.error(`❌ Unknown error: ${error}`);
        }

        console.error('');
        console.error('📚 For help, check:');
        console.error('   - README.md for setup instructions');
        console.error('   - .env.example for configuration examples');
        console.error('   - Run: npm run security:check');
        console.error('');

        process.exit(1);
    }
}

// Additional process event handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Promise Rejection at:', promise);
    console.error('💥 Reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error.message);
    if (error.stack) {
        console.error('Stack:', error.stack);
    }
    process.exit(1);
});

// Show Node.js version warning if too old
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion < 16) {
    console.warn('⚠️ Warning: Node.js version is below recommended minimum (v16)');
    console.warn(`   Current version: ${nodeVersion}`);
    console.warn('   Some features may not work correctly');
    console.warn('');
}

// Start the application
main().catch((error) => {
    console.error('💥 Fatal error in main:', error);
    process.exit(1);
});