import type { RedisClientType } from 'redis';

import { AuthError } from './errors';

const DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const LOGIN_RATE_LIMIT_KEY_PREFIX = 'login:attempts:';

class LoginRateLimiter {
    constructor(private redis: RedisClientType) {}

    private getConfig(): {
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

    private buildKey(email: string): string {
        return `${LOGIN_RATE_LIMIT_KEY_PREFIX}${email.toLowerCase()}`;
    }

    async assertAllowed(email: string): Promise<void> {
        const { maxAttempts } = this.getConfig();
        if (maxAttempts <= 0) {
            return;
        }

        const key = this.buildKey(email);
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

    async recordFailedAttempt(email: string): Promise<void> {
        const { maxAttempts, windowSeconds } = this.getConfig();
        if (maxAttempts <= 0 || windowSeconds <= 0) {
            return;
        }

        const key = this.buildKey(email);
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

    async clear(email: string): Promise<void> {
        const key = this.buildKey(email);
        try {
            await this.redis.del(key);
        } catch {
            // Best effort: do not block login on Redis errors.
        }
    }
}

export { LoginRateLimiter };
