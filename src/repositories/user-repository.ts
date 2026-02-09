import { inject, injectable } from 'inversify';
import { DataSource } from 'typeorm';

import { User } from '../entities';
import { TYPES } from '../lib';

export interface UserRepository {
    findByEmail(email: string): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    create(data: Pick<User, 'email' | 'password' | 'firstName' | 'lastName'>): Promise<User>;
    updateProfile(
        id: string,
        data: { firstName?: string; lastName?: string },
    ): Promise<User | null>;
}

@injectable()
export class UserRepositoryImpl implements UserRepository {
    constructor(@inject(TYPES.DB) private dataSource: DataSource) {}

    private async getRepo() {
        if (!this.dataSource.isInitialized) {
            await this.dataSource.initialize();
        }
        return this.dataSource.getRepository(User);
    }

    async findByEmail(email: string): Promise<User | null> {
        const repo = await this.getRepo();
        const normalizedEmail = email.trim().toLowerCase();
        return await repo.findOne({ where: { email: normalizedEmail } });
    }

    async findById(id: string): Promise<User | null> {
        const repo = await this.getRepo();
        return await repo.findOne({ where: { id } });
    }

    async create(
        data: Pick<User, 'email' | 'password' | 'firstName' | 'lastName'>,
    ): Promise<User> {
        const repo = await this.getRepo();
        const user = repo.create(data);
        return await repo.save(user);
    }

    async updateProfile(
        id: string,
        data: { firstName?: string; lastName?: string },
    ): Promise<User | null> {
        const repo = await this.getRepo();
        const user = await repo.findOne({ where: { id } });
        if (!user) {
            return null;
        }

        if (data.firstName !== undefined) {
            user.firstName = data.firstName;
        }
        if (data.lastName !== undefined) {
            user.lastName = data.lastName;
        }

        return await repo.save(user);
    }
}
