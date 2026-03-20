export class Logger {
  private label: string;

  constructor(label: string) {
    this.label = label;
  }

  info(message: string, meta?: any) {
    console.log(`${new Date().toISOString()} [${this.label}] INFO: ${message}`, meta || '');
  }

  warn(message: string, meta?: any) {
    console.warn(`${new Date().toISOString()} [${this.label}] WARN: ${message}`, meta || '');
  }

  error(message: string, meta?: any) {
    console.error(`${new Date().toISOString()} [${this.label}] ERROR: ${message}`, meta || '');
  }

  debug(message: string, meta?: any) {
    console.debug(`${new Date().toISOString()} [${this.label}] DEBUG: ${message}`, meta || '');
  }
}