import { LogLevel } from '../core/types.js';

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  enableConsole?: boolean;
}

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private enableConsole: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.prefix = options.prefix ?? '';
    this.enableConsole = options.enableConsole ?? true;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    const prefix = this.prefix ? `${this.prefix}` : '';
    return `${timestamp} ${prefix}[${level}] ${message}`;
  }

  private log(level: LogLevel, levelName: string, consoleMethod: (...args: unknown[]) => void, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level) || !this.enableConsole) {
      return;
    }
    consoleMethod(this.formatMessage(levelName, message), ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, 'DEBUG', console.log.bind(console), message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, 'INFO', console.info.bind(console), message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, 'WARN', console.warn.bind(console), message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, 'ERROR', console.error.bind(console), message, ...args);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  child(options: LoggerOptions = {}): Logger {
    return new Logger({
      level: options.level ?? this.level,
      prefix: options.prefix ?? this.prefix,
      enableConsole: options.enableConsole ?? this.enableConsole
    });
  }
}
