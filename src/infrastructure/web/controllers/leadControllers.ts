import { Request, Response, NextFunction } from 'express';

export class leadController {

    getAll(req: Request, res: Response, next: NextFunction) {
        try {
            res.status(200).json({ message: 'getAll' });
        } catch (error) {
            next(error);
        }
    }
}

