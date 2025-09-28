/**
 * Input validation utilities with comprehensive type checking
 */

export interface ValidationRule {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: RegExp;
    enum?: any[];
    custom?: (value: any) => boolean | string;
}

export interface ValidationSchema {
    [key: string]: ValidationRule;
}

export interface ValidationResult<T = any> {
    valid: boolean;
    data: T;
    errors: string[];
    warnings: string[];
}

export class ValidationUtils {
    /**
     * Validate an object against a schema
     */
    public static validateObject<T = any>(
        data: any,
        schema: ValidationSchema
    ): ValidationResult<T> {
        const errors: string[] = [];
        const warnings: string[] = [];
        const validatedData: any = {};

        if (!data || typeof data !== 'object') {
            return {
                valid: false,
                data: {} as T,
                errors: ['Data must be an object'],
                warnings: [],
            };
        }

        // Validate each field in the schema
        for (const [fieldName, rule] of Object.entries(schema)) {
            const value = data[fieldName];
            const fieldResult = this.validateField(fieldName, value, rule);

            if (fieldResult.errors.length > 0) {
                errors.push(...fieldResult.errors);
            }

            if (fieldResult.warnings.length > 0) {
                warnings.push(...fieldResult.warnings);
            }

            if (fieldResult.valid) {
                validatedData[fieldName] = fieldResult.value;
            }
        }

        // Check for unexpected fields
        const allowedFields = Object.keys(schema);
        const providedFields = Object.keys(data);
        const unexpectedFields = providedFields.filter(field => !allowedFields.includes(field));

        if (unexpectedFields.length > 0) {
            warnings.push(`Unexpected fields: ${unexpectedFields.join(', ')}`);
        }

        return {
            valid: errors.length === 0,
            data: validatedData as T,
            errors,
            warnings,
        };
    }

    /**
     * Validate a single field against a rule
     */
    private static validateField(
        fieldName: string,
        value: any,
        rule: ValidationRule
    ): { valid: boolean; value: any; errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if field is required
        if (rule.required && (value === undefined || value === null)) {
            errors.push(`${fieldName} is required`);
            return { valid: false, value, errors, warnings };
        }

        // If field is not required and not provided, it's valid
        if (!rule.required && (value === undefined || value === null)) {
            return { valid: true, value, errors, warnings };
        }

        // Type validation
        if (rule.type && !this.validateType(value, rule.type)) {
            errors.push(`${fieldName} must be of type ${rule.type}`);
            return { valid: false, value, errors, warnings };
        }

        // String-specific validations
        if (rule.type === 'string' && typeof value === 'string') {
            if (rule.minLength !== undefined && value.length < rule.minLength) {
                errors.push(`${fieldName} must be at least ${rule.minLength} characters long`);
            }

            if (rule.maxLength !== undefined && value.length > rule.maxLength) {
                errors.push(`${fieldName} must be no more than ${rule.maxLength} characters long`);
            }

            if (rule.pattern && !rule.pattern.test(value)) {
                errors.push(`${fieldName} does not match the required pattern`);
            }
        }

        // Number-specific validations
        if (rule.type === 'number' && typeof value === 'number') {
            if (rule.min !== undefined && value < rule.min) {
                errors.push(`${fieldName} must be at least ${rule.min}`);
            }

            if (rule.max !== undefined && value > rule.max) {
                errors.push(`${fieldName} must be no more than ${rule.max}`);
            }
        }

        // Enum validation
        if (rule.enum && !rule.enum.includes(value)) {
            errors.push(`${fieldName} must be one of: ${rule.enum.join(', ')}`);
        }

        // Custom validation
        if (rule.custom) {
            const customResult = rule.custom(value);
            if (typeof customResult === 'string') {
                errors.push(`${fieldName}: ${customResult}`);
            } else if (customResult === false) {
                errors.push(`${fieldName} failed custom validation`);
            }
        }

        return {
            valid: errors.length === 0,
            value,
            errors,
            warnings,
        };
    }

    /**
     * Validate the type of a value
     */
    private static validateType(value: any, expectedType: string): boolean {
        switch (expectedType) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            case 'array':
                return Array.isArray(value);
            default:
                return false;
        }
    }

    /**
     * Validate request body size
     */
    public static validateBodySize(contentLength: number, maxSize: number): ValidationResult<number> {
        if (contentLength > maxSize) {
            return {
                valid: false,
                data: contentLength,
                errors: [`Request body too large (${contentLength} bytes, max ${maxSize})`],
                warnings: [],
            };
        }

        return {
            valid: true,
            data: contentLength,
            errors: [],
            warnings: [],
        };
    }

    /**
     * Create common validation schemas
     */
    public static getCommonSchemas() {
        return {
            tokenExchange: {
                auth_code: { required: true, type: 'string' as const, minLength: 1, maxLength: 1000 },
                client_id: { required: true, type: 'string' as const, minLength: 1, maxLength: 100 },
                redirect_uri: { required: false, type: 'string' as const, maxLength: 2000 },
            },
            tokenRefresh: {
                refresh_token: { required: true, type: 'string' as const, minLength: 1, maxLength: 1000 },
                client_id: { required: true, type: 'string' as const, minLength: 1, maxLength: 100 },
            },
            deviceToken: {
                device_code: { required: true, type: 'string' as const, minLength: 1, maxLength: 1000 },
                client_id: { required: true, type: 'string' as const, minLength: 1, maxLength: 100 },
            },
        };
    }
}