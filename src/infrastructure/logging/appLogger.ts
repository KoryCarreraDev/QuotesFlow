import { ILogger } from '../../application/ports/services/ILogger.js';
import { env } from '../../config/env.js';
import { WinstonLogger } from './WinstonLogger.js';

/** Logger del proceso, con el nivel de `LOG_LEVEL`. */
export const appLogger: ILogger = new WinstonLogger(env.LOG_LEVEL);
