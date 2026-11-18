import { env } from '../config/env.js';
import { LocalDiskFileStorage } from '../infrastructure/services/LocalDiskFileStorage.js';
import { PdfLibQuoteGenerator } from '../infrastructure/services/pdf/PdfLibQuoteGenerator.js';

// Servicios sin estado por petición que comparten varios módulos.

// Q-017: en desarrollo los archivos (logos) van a disco; un adaptador compatible con S3 lo reemplazará al desplegar.
export const fileStorage = new LocalDiskFileStorage(env.FILE_STORAGE_DIRECTORY);

export const pdfGenerator = new PdfLibQuoteGenerator();
