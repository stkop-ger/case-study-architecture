import { Request, Response } from 'express';
import { inject } from 'inversify';
import {
    controller,
    httpGet,
    httpPost,
    httpPut,
    request,
    response,
} from 'inversify-express-utils';

import { UserService } from '../services/user-service';
import { BaseController, TYPES } from '../lib';
import { requireAuth } from '../middleware/auth-middleware';

@controller('/users')
export class UserController extends BaseController {
    constructor(@inject(TYPES.UserService) private userService: UserService) {
        super();
    }

    @httpPost('/register')
    async register(@request() req: Request, @response() res: Response) {
        try {
            const user = await this.userService.register(req.body);
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
            const result = await this.userService.authenticate(req.body);
            return res.status(200).json(result);
        } catch (error: any) {
            const statusCode = error?.statusCode ?? 400;
            return res.status(statusCode).json({ error: error.message });
        }
    }

    @httpPost('/refresh')
    async refresh(@request() req: Request, @response() res: Response) {
        try {
            const result = await this.userService.refresh(req.body);
            return res.status(200).json(result);
        } catch (error: any) {
            const statusCode = error?.statusCode ?? 400;
            return res.status(statusCode).json({ error: error.message });
        }
    }

    @httpGet('/profile', requireAuth)
    async getProfile(@request() req: Request, @response() res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'invalid token' });
            }

            const user = await this.userService.getProfile(userId);
            return res.status(200).json({
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

    @httpPut('/profile', requireAuth)
    async updateProfile(@request() req: Request, @response() res: Response) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'invalid token' });
            }

            const user = await this.userService.updateProfile(userId, req.body);
            return res.status(200).json({
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
}
