import { randomUUID } from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';

import { User } from '../../entities';
import { AuthError } from './errors';

interface RefreshTokenResult {
    token: string;
    tokenId: string;
    ttlSeconds: number;
}

const buildJwt = (user: User): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new AuthError('JWT secret is not configured', 500);
    }
    const expiresIn = (process.env.JWT_EXPIRES_IN || '24h') as SignOptions['expiresIn'];
    return jwt.sign(
        {
            sub: user.id,
            email: user.email,
        },
        secret,
        { expiresIn },
    );
};

const buildRefreshToken = (user: User): RefreshTokenResult => {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
        throw new AuthError('Refresh token secret is not configured', 500);
    }
    const expiresIn =
        (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as SignOptions['expiresIn'];
    const tokenId = randomUUID();
    const token = jwt.sign(
        {
            sub: user.id,
            email: user.email,
            type: 'refresh',
            jti: tokenId,
        },
        secret,
        { expiresIn },
    );

    const ttlSeconds = parseDurationToSeconds(expiresIn);
    return { token, tokenId, ttlSeconds };
};

const parseDurationToSeconds = (value: SignOptions['expiresIn']): number => {
    if (typeof value === 'number') {
        return Math.max(0, Math.floor(value));
    }
    if (typeof value !== 'string') {
        throw new Error('refresh token ttl is invalid');
    }

    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error('refresh token ttl is invalid');
    }

    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue)) {
        return Math.max(0, Math.floor(numericValue));
    }

    const match = trimmed.match(/^(\d+)\s*([smhd])$/i);
    if (!match) {
        throw new Error('refresh token ttl is invalid');
    }

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers: Record<string, number> = {
        s: 1,
        m: 60,
        h: 3600,
        d: 86400,
    };

    return amount * multipliers[unit];
};

export { buildJwt, buildRefreshToken };
export type { RefreshTokenResult };
