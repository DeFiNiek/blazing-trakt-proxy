/**
 * Database module exports
 */

export { DatabaseManager } from './database-manager';
export { MemoryAdapter } from './memory-adapter';
export { SQLiteAdapter } from './sqlite-adapter';
export { PostgreSQLAdapter } from './postgresql-adapter';

// Re-export types for convenience
export type {
    DatabaseConfig,
    DatabaseAdapter,
    DatabaseStats,
} from '../../types/database';