import { Router } from 'express';
import { z } from 'zod';
import { AuthController } from '../../infrastructure/web/controllers/AuthControllers.js'
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { ScopedContainer } from '../../cross-cutting/container.js';

const registerSchema = z.object({
    companyName: z.string().min(1),
    ownerEmail: z.string().email(),
    password: z.string().min(6),
    ownerFirstName: z.string().min(1),
    ownerLastName: z.string().min(1),
});

export function authRouter(container: ScopedContainer): Router {
    const router = Router();
    const controller = new AuthController(container.getRegisterCompanyUseCase());
    router.post('/register', validateBody(registerSchema), controller.register);
    return router;
}