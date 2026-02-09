import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export const requireAuth = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const authHeader = req.headers.authorization ?? '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'invalid token' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        return res
            .status(500)
            .json({ error: 'JWT secret is not configured' });
    }

    try {
        const decoded = jwt.verify(token, secret) as {
            sub?: string;
            email?: string;
        };

        if (!decoded?.sub) {
            return res.status(401).json({ error: 'invalid token' });
        }

        req.user = {
            id: String(decoded.sub),
            email: decoded.email,
        };

        return next();
    } catch (error) {
        return res.status(401).json({ error: 'invalid token' });
    }
};
