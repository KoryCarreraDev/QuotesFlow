import { Request, Response, NextFunction } from 'express';
import {
  GetTenantLogoUseCase,
  RemoveTenantLogoUseCase,
  UploadTenantLogoUseCase,
} from '../../../application/use-case/tenant/TenantLogoUseCases.js';
import {
  GetTenantProfileUseCase,
  UpdateTenantProfileUseCase,
} from '../../../application/use-case/tenant/TenantProfileUseCases.js';
import { Role } from '../../../domain/enums/Role.js';
import { HttpStatus } from '../errors/errorResponse.js';

export class TenantController {
  constructor(
    private readonly getProfileUseCase: GetTenantProfileUseCase,
    private readonly updateProfileUseCase: UpdateTenantProfileUseCase,
    private readonly uploadLogoUseCase: UploadTenantLogoUseCase,
    private readonly removeLogoUseCase: RemoveTenantLogoUseCase,
    private readonly getLogoUseCase: GetTenantLogoUseCase,
  ) {}

  getProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = { role: req.user!.role as Role, userId: req.user!.userId };
      res.status(HttpStatus.OK).json(await this.getProfileUseCase.execute(actor));
    } catch (error) {
      next(error);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = { role: req.user!.role as Role, userId: req.user!.userId };
      res.status(HttpStatus.OK).json(await this.updateProfileUseCase.execute(actor, req.body));
    } catch (error) {
      next(error);
    }
  };

  /** El archivo ya pasó por `receiveLogoUpload`, que garantiza `req.file`. */
  uploadLogo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = { role: req.user!.role as Role, userId: req.user!.userId };
      res.status(HttpStatus.OK).json(await this.uploadLogoUseCase.execute(actor, req.file!.buffer));
    } catch (error) {
      next(error);
    }
  };

  removeLogo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = { role: req.user!.role as Role, userId: req.user!.userId };
      await this.removeLogoUseCase.execute(actor);
      res.status(HttpStatus.NO_CONTENT).end();
    } catch (error) {
      next(error);
    }
  };

  getLogo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = { role: req.user!.role as Role, userId: req.user!.userId };
      const logo = await this.getLogoUseCase.execute(actor);
      // Imagen de la propia empresa: privada. `nosniff` ya lo pone helmet.
      res
        .status(HttpStatus.OK)
        .set({ 'Content-Type': logo.contentType, 'Cache-Control': 'private, max-age=300' })
        .send(Buffer.from(logo.content));
    } catch (error) {
      next(error);
    }
  };
}
