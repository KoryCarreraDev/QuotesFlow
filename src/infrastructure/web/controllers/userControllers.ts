import { Request, Response, NextFunction } from 'express';
import {
  InviteUserUseCase,
  ListTenantUsersUseCase,
  ListUserInvitationsUseCase,
  RevokeUserInvitationUseCase,
  SessionActor,
  UpdateTenantUserUseCase,
} from '../../../application/use-case/users/TenantUserUseCases.js';
import { Role } from '../../../domain/enums/Role.js';
import { HttpStatus } from '../errors/errorResponse.js';

/** Casos de uso de `/api/v1/users`. */
export interface TenantUserUseCases {
  listUsers: ListTenantUsersUseCase;
  listInvitations: ListUserInvitationsUseCase;
  invite: InviteUserUseCase;
  revokeInvitation: RevokeUserInvitationUseCase;
  update: UpdateTenantUserUseCase;
}

function sessionActorOf(req: Request): SessionActor {
  return { role: req.user!.role as Role, userId: req.user!.userId };
}

export class UserController {
  constructor(private readonly useCases: TenantUserUseCases) {}

  listUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(HttpStatus.OK).json(await this.useCases.listUsers.execute(sessionActorOf(req)));
    } catch (error) {
      next(error);
    }
  };

  listInvitations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(HttpStatus.OK).json(await this.useCases.listInvitations.execute(sessionActorOf(req)));
    } catch (error) {
      next(error);
    }
  };

  invite = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(HttpStatus.CREATED).json(await this.useCases.invite.execute(sessionActorOf(req), req.body));
    } catch (error) {
      next(error);
    }
  };

  revokeInvitation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.useCases.revokeInvitation.execute(sessionActorOf(req), req.params.id as string);
      res.status(HttpStatus.OK).json({ message: 'Invitation revoked' });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.useCases.update.execute(sessionActorOf(req), req.params.id as string, req.body);
      res.status(HttpStatus.OK).json(user);
    } catch (error) {
      next(error);
    }
  };
}
