import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ValidationError } from '../../../domain/errors/ValidationError.js';
import { LOGO_MAXIMUM_BYTES } from '../../../domain/value-objects/logoImage.js';

// F3-T07: el logo llega como `multipart/form-data` en un único campo `file`. Se lee en memoria con tope de tamaño:
// el tipo real lo decide el caso de uso por el contenido, no multer ni el `Content-Type` que declare el cliente.
const LOGO_FIELD_NAME = 'file';
const SINGLE_FILE = 1;
const NO_FIELDS = 0;
// Un archivo, sin campos de texto: cualquier parte extra se rechaza.
const MAXIMUM_PARTS = 1;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAXIMUM_BYTES, files: SINGLE_FILE, fields: NO_FIELDS, parts: MAXIMUM_PARTS },
});

function invalidUpload(message: string): ValidationError {
  return new ValidationError(ErrorCode.INVALID_LOGO_IMAGE, message);
}

/**
 * Lee el logo de la petición y lo deja en `req.file`. Cualquier fallo de la carga (tamaño, partes de más, campo con
 * otro nombre, cuerpo que no es multipart) responde 400 `INVALID_LOGO_IMAGE`.
 */
export const receiveLogoUpload: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  upload.single(LOGO_FIELD_NAME)(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(invalidUpload(`Logo upload rejected (${error.code}): send one image in the "${LOGO_FIELD_NAME}" field`));
      return;
    }
    if (error) {
      next(error);
      return;
    }
    if (!req.file) {
      next(invalidUpload(`Send the logo as multipart/form-data in the "${LOGO_FIELD_NAME}" field`));
      return;
    }
    next();
  });
};
