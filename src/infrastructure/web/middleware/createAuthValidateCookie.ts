import { Request, Response, NextFunction } from "express";
import { IAuthTokenService } from "../../../application/ports/services/IAuthTokenService.js";

export function createAuthValidateCookie(tokenService: IAuthTokenService) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const token = req.cookies?.accessToken;

            if (!token) return res.status(401).json({ error: 'Not authorized' });
            const payload = tokenService.verifyToken(token);

            req.user = {
                userId: payload.sub,
                tenantId: payload.tenantId,
                role: payload.role,
            };

            next();
        } catch (error) {
            next(error);
        }
    }
}