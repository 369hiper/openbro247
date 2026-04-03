import { fileURLToPath } from 'url';
import { APIServer } from './src/api/server.js';
import { Logger } from './src/utils/logger.js';

console.log('Test started');
const logger = new Logger('Test');
logger.info('Logger works');
console.log('APIServer class:', APIServer.name);
process.exit(0);
