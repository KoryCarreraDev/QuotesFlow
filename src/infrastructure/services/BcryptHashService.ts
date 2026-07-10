import { IHashService } from "../../application/ports/services/IHashService.js";
import bcrypt from 'bcryptjs';

export class BcryptHashService implements IHashService {
    async hash(plain: string): Promise<string> {
        return bcrypt.hash(plain, 10);
    }

    async compare(plain: string, hash: string): Promise<boolean> {
        return bcrypt.compare(plain, hash);
    }
}