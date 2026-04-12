/**
 * Centralized logging utility for tetris_webgpu
 * 
 * Features:
 * - Log levels: debug, info, warn, error
 * - Debug mode can be enabled via localStorage or environment
 * - Production builds can tree-shake debug logs
 */

// Check for debug mode
const DEBUG_KEY = 'tetris_debug';

function isDebugMode(): boolean {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(DEBUG_KEY) === 'true';
  }
  return false;
}

// Enable/disable debug mode
export function enableDebug(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DEBUG_KEY, 'true');
  }
}

export function disableDebug(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(DEBUG_KEY);
  }
}

export function isDebugEnabled(): boolean {
  return isDebugMode();
}

// Log level type
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Logger interface
export interface Logger {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

// Prefix messages with a category
function formatMessage(category: string, args: any[]): any[] {
  return [`[${category}]`, ...args];
}

// Create a category-specific logger
export function createLogger(category: string): Logger {
  const debugEnabled = isDebugMode();
  
  return {
    debug: (...args: any[]) => {
      if (debugEnabled) {
        console.log(...formatMessage(category, args));
      }
    },
    info: (...args: any[]) => {
      console.log(...formatMessage(category, args));
    },
    warn: (...args: any[]) => {
      console.warn(...formatMessage(category, args));
    },
    error: (...args: any[]) => {
      console.error(...formatMessage(category, args));
    },
  };
}

// Default logger instance
export const logger: Logger = createLogger('App');

// Specialized loggers for common categories
export const textureLogger = createLogger('Texture');
export const shaderLogger = createLogger('Shader');
export const renderLogger = createLogger('Render');
export const audioLogger = createLogger('Audio');
export const gameLogger = createLogger('Game');
export const wasmLogger = createLogger('WASM');
export const videoLogger = createLogger('Video');

// No-op logger for production (completely silent)
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Export default
export default logger;
