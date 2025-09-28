/**
 * Centralized logging service with file and console output
 */

import * as fs from 'fs';
import * as path from 'path';
import { LoggingConfig } from '../types/config';
import { LogEntry } from '../types/http';
import { SecurityUtils } from '../utils/security-utils';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export class LoggingService {
    private config: LoggingConfig;
    private logStream?: fs.WriteStream;
    private requestLogs: LogEntry[] = [];

    constructor(config: LoggingConfig) {
        this.config = config;
        this.setupLogging();
    }

    private setupLogging(): void {
        // Ensure logs directory exists
        if (!fs.existsSync(this.config.logDirectory)) {
            fs.mkdirSync(this.config.logDirectory, { recursive: true });
        }

        // Create log file stream
        const logFile = path.join(
            this.config.logDirectory,
            `server-${new Date().toISOString().split('T')[0]}.log`
        );
        this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
    }

    public log(message: string, level: LogLevel = 'info'): void {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

        // Console output with colors
        this.writeToConsole(logEntry, level);

        // File output
        if (this.logStream) {
            this.logStream.write(logEntry + '\n');
        }
    }

    private writeToConsole(message: string, level: LogLevel): void {
        const colors = {
            info: '\x1b[36m',    // Cyan
            warn: '\x1b[33m',    // Yellow
            error: '\x1b[31m',   // Red
            debug: '\x1b[35m',   // Magenta
        };
        const reset = '\x1b[0m';

        const coloredMessage = `${colors[level]}${message}${reset}`;
        console.log(coloredMessage);
    }

    public logRequest(entry: LogEntry): void {
        this.requestLogs.push(entry);

        // Trim logs if too many
        if (this.requestLogs.length > 5000) {
            this.requestLogs = this.requestLogs.slice(-3000);
        }

        if (this.config.enableDetailedLogging || !entry.success) {
            const status = entry.success ? '✅' : '❌';
            const durationStr = entry.duration ? ` (${entry.duration}ms)` : '';
            const errorStr = entry.error ? ` - ${entry.error}` : '';

            this.log(
                `${status} ${entry.method} ${entry.path} - ${SecurityUtils.maskIpAddress(entry.ip)}${durationStr}${errorStr}`,
                entry.success ? 'info' : 'warn'
            );
        }
    }

    public getRequestLogs(limit?: number): LogEntry[] {
        return limit ? this.requestLogs.slice(-limit) : [...this.requestLogs];
    }

    public getSuccessfulRequestCount(): number {
        return this.requestLogs.filter(log => log.success).length;
    }

    public getErrorRate(): string {
        const total = this.requestLogs.length;
        if (total === 0) return '0.00';

        const errors = total - this.getSuccessfulRequestCount();
        return ((errors / total) * 100).toFixed(2);
    }

    public getRecentErrors(timeWindowMs: number = 3600000, limit: number = 10): LogEntry[] {
        const now = Date.now();
        return this.requestLogs
            .filter(log => !log.success && (now - log.timestamp) < timeWindowMs)
            .slice(-limit);
    }

    public getAverageResponseTime(): number {
        const logsWithDuration = this.requestLogs.filter(log => log.duration !== undefined);
        if (logsWithDuration.length === 0) return 0;

        const totalDuration = logsWithDuration.reduce((sum, log) => sum + (log.duration || 0), 0);
        return Math.round(totalDuration / logsWithDuration.length);
    }

    public getRequestsPerMinute(): number {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        return this.requestLogs.filter(log => log.timestamp > oneMinuteAgo).length;
    }

    public getLogStats(): {
        totalRequests: number;
        successfulRequests: number;
        errorRequests: number;
        averageResponseTime: number;
        requestsPerMinute: number;
        errorRate: string;
    } {
        return {
            totalRequests: this.requestLogs.length,
            successfulRequests: this.getSuccessfulRequestCount(),
            errorRequests: this.requestLogs.length - this.getSuccessfulRequestCount(),
            averageResponseTime: this.getAverageResponseTime(),
            requestsPerMinute: this.getRequestsPerMinute(),
            errorRate: this.getErrorRate(),
        };
    }

    public close(): void {
        if (this.logStream) {
            this.logStream.end();
        }
    }
}