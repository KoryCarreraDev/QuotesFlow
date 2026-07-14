import { Router } from 'express';
import { AuthController } from '../../infrastructure/web/controllers/AuthControllers.js'
import { validateBody } from '../../infrastructure/web/middleware/validateBody.js';
import { ScopedContainer } from '../../cross-cutting/container.js';
import { registerSchema, loginSchema } from "../../presentation/schemas/authSchema.js";

export function authRouter(container: ScopedContainer): Router {
    const router = Router();
    const controller = new AuthController(container.getRegisterCompanyUseCase(), container.getLoginUseCase());
    router.post('/register', validateBody(registerSchema), controller.register);
    router.post('/login', validateBody(loginSchema), controller.login);
    return router;
}