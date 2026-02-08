import { Request, Response } from 'express';
import { inject } from 'inversify';
import {
    controller,
    httpPost,
    request,
    response,
} from 'inversify-express-utils';

import { UserService } from '../services/user-service';
import { BaseController, TYPES } from '../lib';

@controller('/users')
export class UserController extends BaseController {
    constructor(@inject(TYPES.UserService) private userService: UserService) {
        super();
    }

    @httpPost('/register')
    async register(@request() req: Request, @response() res: Response) {
        try {
            const user = await this.userService.registerUser(req.body);
            return res.status(201).json({
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            });
        } catch (error: any) {
            const statusCode = error?.statusCode ?? 400;
            return res.status(statusCode).json({ error: error.message });
        }
    }

    @httpPost('/login')
    async login(@request() req: Request, @response() res: Response) {
        try {
            const result = await this.userService.loginUser(req.body);
            return res.status(200).json(result);
        } catch (error: any) {
            const statusCode = error?.statusCode ?? 400;
            return res.status(statusCode).json({ error: error.message });
        }
    }
}
