export class Logger {
	constructor() {
	}

	error(message: string, context?: Record<string, unknown>): void {
		console.log(message);
	}

	warn(message: string, context?: Record<string, unknown>): void {
		console.log(message);
	}

	info(message: string, context?: Record<string, unknown>): void {
		console.log(message);
	}

	debug(message: string, context?: Record<string, unknown>): void {
	}
}

// Singleton instance
let loggerInstance: Logger | null = null;

/**
 * Get or create the logger instance
 */
export function getLogger(): Logger {
	if (!loggerInstance) {
		loggerInstance = new Logger();
	}
	return loggerInstance;
}
