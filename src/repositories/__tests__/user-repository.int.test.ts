import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';

import { User } from '../../entities';
import { UserRepositoryImpl } from '../user-repository';

dotenv.config();

const buildTestDataSource = async (): Promise<DataSource> => {
    const portValue =
        process.env.TEST_DATABASE_PORT ?? process.env.DATABASE_PORT ?? '5432';
    const parsedPort = Number(portValue);

    const dataSource = new DataSource({
        type: 'postgres',
        host: process.env.TEST_DATABASE_HOST ?? process.env.DATABASE_HOST ?? 'localhost',
        port: Number.isFinite(parsedPort) ? parsedPort : 5432,
        username: String(
            process.env.TEST_DATABASE_USER ?? process.env.DATABASE_USER ?? 'postgres',
        ),
        password: String(
            process.env.TEST_DATABASE_PASSWORD ?? process.env.DATABASE_PASSWORD ?? '',
        ),
        database:
            process.env.TEST_DATABASE_NAME ??
            process.env.DATABASE_NAME ??
            'case_study_db_test',
        entities: [User],
        synchronize: true,
    });

    await dataSource.initialize();
    return dataSource;
};

describe('UserRepository integration', () => {
    let dataSource: DataSource;
    let repository: UserRepositoryImpl;

    beforeAll(async () => {
        dataSource = await buildTestDataSource();
        repository = new UserRepositoryImpl(dataSource);
    });

    afterEach(async () => {
        if (!dataSource?.isInitialized) {
            return;
        }
        await dataSource.getRepository(User).clear();
    });

    afterAll(async () => {
        if (dataSource?.isInitialized) {
            await dataSource.destroy();
        }
    });

    it('creates a user and persists it', async () => {
        const created = await repository.createUser({
            email: 'jane@example.com',
            password: 'salt.hash',
            firstName: 'Jane',
            lastName: 'Doe',
        });

        expect(created.id).toBeTruthy();
        expect(created.email).toBe('jane@example.com');
        expect(created.firstName).toBe('Jane');
        expect(created.lastName).toBe('Doe');

        const persisted = await dataSource
            .getRepository(User)
            .findOne({ where: { email: 'jane@example.com' } });

        expect(persisted).not.toBeNull();
        expect(persisted?.id).toBe(created.id);
    });

    it('finds a user by email', async () => {
        const saved = await repository.createUser({
            email: 'john@example.com',
            password: 'salt.hash',
            firstName: 'John',
            lastName: 'Doe',
        });

        const found = await repository.findByEmail('john@example.com');

        expect(found).not.toBeNull();
        expect(found?.id).toBe(saved.id);
    });

    it('returns null when the email does not exist', async () => {
        const found = await repository.findByEmail('missing@example.com');

        expect(found).toBeNull();
    });
});
