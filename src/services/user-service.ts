import { injectable, inject } from 'inversify';

import { User } from '../entities';
import { TYPES } from '../lib';
import { UserRepository } from '../repositories/user-repository';
import {
    RefreshTokenRepository,
} from '../repositories/refresh-token-repository';
import { PasswordManagerService } from './password-manager-service';
import jwt from 'jsonwebtoken';
import type { RedisClientType } from 'redis';

import { AuthError, NotFoundError } from './user/errors';
import { LoginRateLimiter } from './user/login-rate-limiter';
import { buildJwt, buildRefreshToken } from './user/token-utils';
import {
    ensureLengthLimit,
    ensureRequired,
    isStrongPassword,
    isValidEmail,
    PASSWORD_HASH_MAX_LENGTH,
} from './user/validation';

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

@injectable()
export class UserServiceImpl implements UserService {
    private loginRateLimiter: LoginRateLimiter;

    constructor(
        @inject(TYPES.UserRepository) private userRepository: UserRepository,
        @inject(TYPES.PasswordManagerService)
        private passwordManager: PasswordManagerService,
        @inject(TYPES.RefreshTokenRepository)
        private refreshTokenRepository: RefreshTokenRepository,
        @inject(TYPES.RedisClient) private redis: RedisClientType,
    ) {
        this.loginRateLimiter = new LoginRateLimiter(this.redis);
    }

    async register(input: RegisterUserInput): Promise<User> {
        const email = input.email?.trim().toLowerCase();
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
        const email = input.email?.trim().toLowerCase();
        const password = input.password ?? '';

        ensureRequired(email, 'email');
        ensureRequired(password, 'password');

        if (!isValidEmail(email)) {
            throw new Error('email is invalid');
        }

        await this.loginRateLimiter.assertAllowed(email);

        const user = await this.userRepository.findByEmail(email);
        if (!user) {
            await this.loginRateLimiter.recordFailedAttempt(email);
            throw new AuthError('invalid credentials', 401);
        }

        const isMatch = await this.passwordManager.compare(
            user.password,
            password,
        );
        if (!isMatch) {
            await this.loginRateLimiter.recordFailedAttempt(email);
            throw new AuthError('invalid credentials', 401);
        }

        await this.loginRateLimiter.clear(email);

        const accessToken = buildJwt(user);
        const refreshToken = buildRefreshToken(user);
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

        const accessToken = buildJwt(user);
        const nextRefreshToken = buildRefreshToken(user);
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
        const email = input.email?.trim().toLowerCase();
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
}
