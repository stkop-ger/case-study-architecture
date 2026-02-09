import { inject, injectable } from 'inversify';
import type { RedisClientType } from 'redis';

import { TYPES } from '../lib';

export interface RefreshTokenRepository {
    store(tokenId: string, userId: string, ttlSeconds: number): Promise<void>;
    get(tokenId: string): Promise<string | null>;
    revoke(tokenId: string): Promise<void>;
}

@injectable()
export class RedisRefreshTokenRepository implements RefreshTokenRepository {
    constructor(
        @inject(TYPES.RedisClient) private redis: RedisClientType,
    ) {}

    private buildKey(tokenId: string) {
        return `refresh:${tokenId}`;
    }

    async store(
        tokenId: string,
        userId: string,
        ttlSeconds: number,
    ): Promise<void> {
        const key = this.buildKey(tokenId);
        await this.redis.set(key, userId, { EX: ttlSeconds });
    }

    async get(tokenId: string): Promise<string | null> {
        const key = this.buildKey(tokenId);
        return await this.redis.get(key);
    }

    async revoke(tokenId: string): Promise<void> {
        const key = this.buildKey(tokenId);
        await this.redis.del(key);
    }
}

@injectable()
export class InMemoryRefreshTokenRepository
    implements RefreshTokenRepository
{
    private storage = new Map<
        string,
        { userId: string; expiresAt: number }
    >();

    async store(
        tokenId: string,
        userId: string,
        ttlSeconds: number,
    ): Promise<void> {
        const expiresAt = Date.now() + ttlSeconds * 1000;
        this.storage.set(tokenId, { userId, expiresAt });
    }

    async get(tokenId: string): Promise<string | null> {
        const entry = this.storage.get(tokenId);
        if (!entry) {
            return null;
        }
        if (Date.now() >= entry.expiresAt) {
            this.storage.delete(tokenId);
            return null;
        }
        return entry.userId;
    }

    async revoke(tokenId: string): Promise<void> {
        this.storage.delete(tokenId);
    }
}
