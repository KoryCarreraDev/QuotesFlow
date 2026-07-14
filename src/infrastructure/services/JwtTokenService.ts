import { IAuthTokenService } from "../../application/ports/services/IAuthTokenService.js";
import { IPayload } from "../../application/ports/services/IAuthTokenService.js";
import jwt from 'jsonwebtoken';
import { env } from "../../config/env.js";

export class JwTokenService implements IAuthTokenService {

    private readonly JWT_SECRET = env.JWT_SECRET;
    private readonly JWT_EXPIRATION = env.JWT_EXPIRATION as any;
    
    generateToken(payload: IPayload): string {
        const token = jwt.sign(payload, this.JWT_SECRET, {
            expiresIn: this.JWT_EXPIRATION
        })
        return token;
    }

    verifyToken(token: string): IPayload {
        const payload: IPayload = jwt.verify(token, this.JWT_SECRET) as IPayload
        return payload;
    }
}

