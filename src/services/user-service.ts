import { injectable, inject } from 'inversify';

import { User } from '../entities';
import { TYPES } from '../lib';
import { UserRepository } from '../repositories/user-repository';
import {
    RefreshTokenRepository,
} from '../repositories/refresh-token-repository';
import { PasswordManagerService } from './password-manager-service';
import jwt, { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { RedisClientType } from 'redis';

export interface RegisterUserInput {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
}

export interface LoginUserInput {
    email: string;
    password: string;
}

export interface LoginResult {
    token: string;
    refreshToken: string;
}

export interface UpdateProfileDto {
    firstName?: string;
    lastName?: string;
}

export interface RefreshTokenInput {
    refreshToken: string;
}

export interface PasswordResetRequestInput {
    email: string;
}

export interface PasswordResetConfirmInput {
    token: string;
    password: string;
}

export interface UserService {
    register(input: RegisterUserInput): Promise<User>;
    authenticate(input: LoginUserInput): Promise<LoginResult>;
    refresh(input: RefreshTokenInput): Promise<LoginResult>;
    requestPasswordReset(input: PasswordResetRequestInput): Promise<void>;
    confirmPasswordReset(input: PasswordResetConfirmInput): Promise<void>;
    getProfile(userId: string): Promise<User>;
    updateProfile(userId: string, data: UpdateProfileDto): Promise<User>;
}

const MAX_LENGTH = 50;
const PASSWORD_HASH_MAX_LENGTH = 255;
const DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const LOGIN_RATE_LIMIT_KEY_PREFIX = 'login:attempts:';

const isValidEmail = (email: string) => {
    const trimmed = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed);
};

const isStrongPassword = (password: string) => {
    if (password.length < 8) {
        return false;
    }
    if (!/[A-Z]/.test(password)) {
        return false;
    }
    if (!/[a-z]/.test(password)) {
        return false;
    }
    if (!/[0-9]/.test(password)) {
        return false;
    }
    return true;
};

const ensureRequired = (value: string, field: string) => {
    if (!value || value.trim().length === 0) {
        throw new Error(`${field} is required`);
    }
};

const ensureLengthLimit = (value: string, field: string, maxLength = MAX_LENGTH) => {
    if (value.length > maxLength) {
        throw new Error(`${field} must be ${maxLength} characters or fewer`);
    }
};

class AuthError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
    }
}

class NotFoundError extends Error {
    readonly statusCode: number;

    constructor(message: string) {
        super(message);
        this.statusCode = 404;
    }
}

@injectable()
export class UserServiceImpl implements UserService {
    constructor(
        @inject(TYPES.UserRepository) private userRepository: UserRepository,
        @inject(TYPES.PasswordManagerService)
        private passwordManager: PasswordManagerService,
        @inject(TYPES.RefreshTokenRepository)
        private refreshTokenRepository: RefreshTokenRepository,
        @inject(TYPES.RedisClient) private redis: RedisClientType,
    ) {}

    private buildJwt(user: User): string {
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
    }

    private buildRefreshToken(user: User): {
        token: string;
        tokenId: string;
        ttlSeconds: number;
    } {
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
    }

    async register(input: RegisterUserInput): Promise<User> {
        const email = input.email?.trim();
        const password = input.password ?? '';
        const firstName = input.firstName?.trim();
        const lastName = input.lastName?.trim();

        ensureRequired(email, 'email');
        ensureRequired(password, 'password');
        ensureRequired(firstName, 'firstName');
        ensureRequired(lastName, 'lastName');

        if (!isValidEmail(email)) {
            throw new Error('email is invalid');
        }

        ensureLengthLimit(email, 'email');
        ensureLengthLimit(password, 'password');
        ensureLengthLimit(firstName, 'firstName');
        ensureLengthLimit(lastName, 'lastName');

        if (!isStrongPassword(password)) {
            throw new Error(
                'password must be at least 8 characters and include uppercase, lowercase, and a number',
            );
        }

        const existing = await this.userRepository.findByEmail(email);
        if (existing) {
            throw new Error('email already exists');
        }

        const hashedPassword = await this.passwordManager.toHash(password);
        ensureLengthLimit(
            hashedPassword,
            'password',
            PASSWORD_HASH_MAX_LENGTH,
        );

        return await this.userRepository.create({
            email,
            password: hashedPassword,
            firstName,
            lastName,
        });
    }

    async authenticate(input: LoginUserInput): Promise<LoginResult> {
        const email = input.email?.trim();
        const password = input.password ?? '';

        ensureRequired(email, 'email');
        ensureRequired(password, 'password');

        if (!isValidEmail(email)) {
            throw new Error('email is invalid');
        }

        await this.assertLoginAttemptAllowed(email);

        const user = await this.userRepository.findByEmail(email);
        if (!user) {
            await this.recordFailedLoginAttempt(email);
            throw new AuthError('invalid credentials', 401);
        }

        const isMatch = await this.passwordManager.compare(
            user.password,
            password,
        );
        if (!isMatch) {
            await this.recordFailedLoginAttempt(email);
            throw new AuthError('invalid credentials', 401);
        }

        await this.clearLoginAttempts(email);

        const accessToken = this.buildJwt(user);
        const refreshToken = this.buildRefreshToken(user);
        await this.refreshTokenRepository.store(
            refreshToken.tokenId,
            user.id,
            refreshToken.ttlSeconds,
        );

        return { token: accessToken, refreshToken: refreshToken.token };
    }

    async refresh(input: RefreshTokenInput): Promise<LoginResult> {
        const refreshToken = input.refreshToken ?? '';
        ensureRequired(refreshToken, 'refreshToken');

        const secret = process.env.JWT_REFRESH_SECRET;
        if (!secret) {
            throw new AuthError('Refresh token secret is not configured', 500);
        }

        let decoded: {
            sub?: string;
            email?: string;
            jti?: string;
            type?: string;
        };

        try {
            decoded = jwt.verify(refreshToken, secret) as typeof decoded;
        } catch (error) {
            throw new AuthError('invalid token', 401);
        }

        if (!decoded?.sub || !decoded?.jti || decoded.type !== 'refresh') {
            throw new AuthError('invalid token', 401);
        }

        const storedUserId = await this.refreshTokenRepository.get(decoded.jti);
        if (!storedUserId || storedUserId !== decoded.sub) {
            throw new AuthError('invalid token', 401);
        }

        const user = await this.userRepository.findById(decoded.sub);
        if (!user) {
            throw new AuthError('invalid token', 401);
        }

        await this.refreshTokenRepository.revoke(decoded.jti);

        const accessToken = this.buildJwt(user);
        const nextRefreshToken = this.buildRefreshToken(user);
        await this.refreshTokenRepository.store(
            nextRefreshToken.tokenId,
            user.id,
            nextRefreshToken.ttlSeconds,
        );

        return {
            token: accessToken,
            refreshToken: nextRefreshToken.token,
        };
    }

    async requestPasswordReset(input: PasswordResetRequestInput): Promise<void> {
        const email = input.email?.trim();
        ensureRequired(email, 'email');

        if (!isValidEmail(email)) {
            throw new Error('email is invalid');
        }

        ensureLengthLimit(email, 'email');

        // Endpoint structure only: do not send email or persist reset tokens yet.
        // We intentionally do not disclose whether the user exists.
        await this.userRepository.findByEmail(email);
    }

    async confirmPasswordReset(input: PasswordResetConfirmInput): Promise<void> {
        const token = input.token ?? '';
        const password = input.password ?? '';

        ensureRequired(token, 'token');
        ensureRequired(password, 'password');
        ensureLengthLimit(token, 'token', 512);
        ensureLengthLimit(password, 'password');

        if (!isStrongPassword(password)) {
            throw new Error(
                'password must be at least 8 characters and include uppercase, lowercase, and a number',
            );
        }

        // Endpoint structure only: no token verification or password update yet.
    }

    async getProfile(userId: string): Promise<User> {
        ensureRequired(userId, 'userId');

        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new NotFoundError('user not found');
        }

        return user;
    }

    async updateProfile(userId: string, data: UpdateProfileDto): Promise<User> {
        ensureRequired(userId, 'userId');

        const firstName = data?.firstName?.trim();
        const lastName = data?.lastName?.trim();

        if (!firstName && !lastName) {
            throw new Error('firstName or lastName is required');
        }

        if (firstName !== undefined) {
            ensureRequired(firstName, 'firstName');
            ensureLengthLimit(firstName, 'firstName');
        }

        if (lastName !== undefined) {
            ensureRequired(lastName, 'lastName');
            ensureLengthLimit(lastName, 'lastName');
        }

        const updated = await this.userRepository.updateProfile(userId, {
            firstName,
            lastName,
        });

        if (!updated) {
            throw new NotFoundError('user not found');
        }

        return updated;
    }

    private getLoginRateLimitConfig(): {
        maxAttempts: number;
        windowSeconds: number;
    } {
        const maxAttempts = Number(
            process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS ??
                DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
        );
        const windowSeconds = Number(
            process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS ??
                DEFAULT_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
        );

        return {
            maxAttempts: Number.isFinite(maxAttempts)
                ? maxAttempts
                : DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
            windowSeconds: Number.isFinite(windowSeconds)
                ? windowSeconds
                : DEFAULT_LOGIN_RATE_LIMIT_WINDOW_SECONDS,
        };
    }

    private buildLoginRateLimitKey(email: string): string {
        return `${LOGIN_RATE_LIMIT_KEY_PREFIX}${email.toLowerCase()}`;
    }

    private async assertLoginAttemptAllowed(email: string): Promise<void> {
        const { maxAttempts } = this.getLoginRateLimitConfig();
        if (maxAttempts <= 0) {
            return;
        }

        const key = this.buildLoginRateLimitKey(email);
        try {
            const current = await this.redis.get(key);
            const attempts = current ? Number(current) : 0;
            if (Number.isFinite(attempts) && attempts >= maxAttempts) {
                throw new AuthError('too many login attempts', 429);
            }
        } catch (error) {
            if (error instanceof AuthError) {
                throw error;
            }
        }
    }

    private async recordFailedLoginAttempt(email: string): Promise<void> {
        const { maxAttempts, windowSeconds } = this.getLoginRateLimitConfig();
        if (maxAttempts <= 0 || windowSeconds <= 0) {
            return;
        }

        const key = this.buildLoginRateLimitKey(email);
        try {
            const attempts = await this.redis.incr(key);
            if (attempts === 1) {
                await this.redis.expire(key, windowSeconds);
            }
            if (attempts >= maxAttempts) {
                throw new AuthError('too many login attempts', 429);
            }
        } catch (error) {
            if (error instanceof AuthError) {
                throw error;
            }
        }
    }

    private async clearLoginAttempts(email: string): Promise<void> {
        const key = this.buildLoginRateLimitKey(email);
        try {
            await this.redis.del(key);
        } catch {
            // Best effort: do not block login on Redis errors.
        }
    }
}

const parseDurationToSeconds = (
    value: SignOptions['expiresIn'],
): number => {
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
