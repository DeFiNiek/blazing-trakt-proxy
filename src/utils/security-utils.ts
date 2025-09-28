/**
 * Security utility functions for authentication, hashing, and validation
 */

import * as crypto from 'crypto';

export class SecurityUtils {
    /**
     * Generate a secure random API key
     */
    public static generateApiKey(length: number = 32): string {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Hash an API key using SHA-256
     */
    public static hashApiKey(apiKey: string): string {
        return crypto.createHash('sha256').update(apiKey).digest('hex');
    }

    /**
     * Verify an API key against its hash using timing-safe comparison
     */
    public static verifyApiKey(providedKey: string, storedHash: string): boolean {
        try {
            const providedKeyHash = this.hashApiKey(providedKey);

            return crypto.timingSafeEqual(
                Buffer.from(providedKeyHash, 'hex'),
                Buffer.from(storedHash, 'hex')
            );
        } catch {
            return false;
        }
    }

    /**
     * Mask IP address for privacy in logs
     */
    public static maskIpAddress(ip: string): string {
        if (ip.includes(':')) {
            // IPv6
            const parts = ip.split(':');
            return parts.slice(0, 4).join(':') + '::xxxx';
        } else {
            // IPv4
            return ip.replace(/\.\d+$/, '.xxx');
        }
    }

    /**
     * Validate API key strength
     */
    public static validateApiKeyStrength(apiKey: string): {
        valid: boolean;
        score: number;
        issues: string[];
        recommendations: string[];
    } {
        const issues: string[] = [];
        const recommendations: string[] = [];
        let score = 0;

        // Length check
        if (apiKey.length < 16) {
            issues.push('API key is too short (minimum 16 characters)');
        } else if (apiKey.length >= 32) {
            score += 30;
        } else {
            score += 15;
            recommendations.push('Consider using a longer API key (32+ characters)');
        }

        // Character diversity
        const hasLowercase = /[a-z]/.test(apiKey);
        const hasUppercase = /[A-Z]/.test(apiKey);
        const hasNumbers = /[0-9]/.test(apiKey);
        const hasSpecialChars = /[^a-zA-Z0-9]/.test(apiKey);

        const charTypes = [hasLowercase, hasUppercase, hasNumbers, hasSpecialChars].filter(Boolean).length;

        if (charTypes >= 3) {
            score += 25;
        } else if (charTypes >= 2) {
            score += 15;
            recommendations.push('Add more character types (uppercase, lowercase, numbers, symbols)');
        } else {
            issues.push('API key lacks character diversity');
            recommendations.push('Use a mix of uppercase, lowercase, numbers, and symbols');
        }

        // Pattern checks
        if (/^(.)\1+$/.test(apiKey)) {
            issues.push('API key contains only repeated characters');
        } else {
            score += 10;
        }

        // Common weak patterns
        const weakPatterns = [
            /^(123|abc|password|test|demo|key|admin)/i,
            /^(.{1,3})\1+$/,  // Short repeating patterns
            /(012|123|234|345|456|567|678|789|890|abc|bcd|cde)/i
        ];

        for (const pattern of weakPatterns) {
            if (pattern.test(apiKey)) {
                issues.push('API key contains predictable patterns');
                break;
            }
        }

        // Entropy estimation (simplified)
        const uniqueChars = new Set(apiKey).size;
        const entropyScore = (uniqueChars / apiKey.length) * 35;
        score += Math.min(entropyScore, 35);

        return {
            valid: issues.length === 0 && score >= 60,
            score: Math.min(score, 100),
            issues,
            recommendations,
        };
    }

    /**
     * Generate secure session token
     */
    public static generateSessionToken(): string {
        return crypto.randomBytes(32).toString('base64url');
    }

    /**
     * Create HMAC signature
     */
    public static createHmacSignature(data: string, secret: string): string {
        return crypto.createHmac('sha256', secret).update(data).digest('hex');
    }

    /**
     * Verify HMAC signature
     */
    public static verifyHmacSignature(data: string, signature: string, secret: string): boolean {
        const expectedSignature = this.createHmacSignature(data, secret);

        try {
            return crypto.timingSafeEqual(
                Buffer.from(signature, 'hex'),
                Buffer.from(expectedSignature, 'hex')
            );
        } catch {
            return false;
        }
    }

    /**
     * Sanitize user input to prevent XSS
     */
    public static sanitizeInput(input: string): string {
        return input
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/[&]/g, '&amp;')
            .replace(/["]/g, '&quot;')
            .replace(/[']/g, '&#x27;')
            .replace(/\0/g, ''); // Remove null bytes
    }

    /**
     * Validate URL format and security
     */
    public static validateUrl(url: string): { valid: boolean; issues: string[] } {
        const issues: string[] = [];

        try {
            const urlObj = new URL(url);

            // Check protocol
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                issues.push('URL must use HTTP or HTTPS protocol');
            }

            // Check for suspicious patterns
            if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
                issues.push('Localhost URLs may not be suitable for production');
            }

            // Check for private IP ranges
            const privateIpPatterns = [
                /^10\./,
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
                /^192\.168\./
            ];

            if (privateIpPatterns.some(pattern => pattern.test(urlObj.hostname))) {
                issues.push('Private IP addresses may not be accessible');
            }

        } catch {
            issues.push('Invalid URL format');
        }

        return {
            valid: issues.length === 0,
            issues,
        };
    }

    /**
     * Rate limiting key generation
     */
    public static generateRateLimitKey(ip: string, path?: string): string {
        const base = this.maskIpAddress(ip);
        return path ? `${base}:${path}` : base;
    }

    /**
     * Check if request is from a suspicious user agent
     */
    public static isSuspiciousUserAgent(userAgent: string): {
        suspicious: boolean;
        score: number;
        reasons: string[];
    } {
        const reasons: string[] = [];
        let score = 0;

        const botPatterns = [
            'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget', 'python',
            'requests', 'urllib', 'axios', 'httpclient', 'okhttp'
        ];

        const normalizedUA = userAgent.toLowerCase();

        // Check for bot patterns
        if (botPatterns.some(pattern => normalizedUA.includes(pattern))) {
            score += 60;
            reasons.push('User-Agent indicates automated tool');
        }

        // Check length
        if (userAgent.length < 10) {
            score += 30;
            reasons.push('User-Agent too short');
        }

        // Check for missing common fields
        if (normalizedUA === 'unknown' || !userAgent) {
            score += 40;
            reasons.push('Missing or invalid User-Agent');
        }

        return {
            suspicious: score >= 50,
            score,
            reasons,
        };
    }

    /**
     * Generate cache key for tokens
     */
    public static generateCacheKey(input: string, prefix?: string): string {
        const hash = crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
        return prefix ? `${prefix}:${hash}` : hash;
    }
}