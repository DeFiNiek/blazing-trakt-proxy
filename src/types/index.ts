/**
 * Main type exports for the Trakt proxy server
 */

// Configuration types
export * from './config';

// HTTP types
export * from './http';

// Trakt API types
export * from './trakt';

// Database types
export * from './database';

// Re-export commonly used types for convenience
export type {
  ApplicationConfig,
  ServerConfig,
  TraktConfig,
  SecurityConfig,
  LoggingConfig,
} from './config';

export type {
  RequestContext,
  ResponseContext,
  Middleware,
  Controller,
  Route,
  HttpMethod,
  LogEntry,
  RateLimitEntry,
} from './http';

export type {
  TraktTokenResponse,
  CachedToken,
  TokenExchangeRequest,
  TokenRefreshRequest,
  DeviceTokenRequest,
  TokenResponse,
} from './trakt';

export type {
  DatabaseConfig,
  DatabaseAdapter,
  DatabaseStats,
} from './database';