import { inject, injectable } from 'inversify';
import { DataSource } from 'typeorm';

import { User } from '../entities';
import { TYPES } from '../lib';

export interface UserRepository {
    findByEmail(email: string): Promise<User | null>;
    createUser(data: Pick<User, 'email' | 'password' | 'firstName' | 'lastName'>): Promise<User>;
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
        return await repo.findOne({ where: { email } });
    }

    async createUser(
        data: Pick<User, 'email' | 'password' | 'firstName' | 'lastName'>,
    ): Promise<User> {
        const repo = await this.getRepo();
        const user = repo.create(data);
        return await repo.save(user);
    }
}
