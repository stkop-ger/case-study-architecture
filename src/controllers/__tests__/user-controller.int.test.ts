import 'reflect-metadata';
import { json } from 'body-parser';
import { Container } from 'inversify';
import { InversifyExpressServer } from 'inversify-express-utils';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';

import '../user-controller';
import { TYPES } from '../../lib';
import { UserServiceImpl } from '../../services/user-service';
import {
    PasswordManagerServiceImpl,
} from '../../services/password-manager-service';
import { UserRepositoryImpl } from '../../repositories/user-repository';
import { User } from '../../entities';

dotenv.config();

const buildTestDataSource = async (): Promise<DataSource> => {
    const portValue =
        process.env.TEST_DATABASE_PORT ?? process.env.DATABASE_PORT ?? '5432';
    const parsedPort = Number(portValue);

    const dataSource = new DataSource({
        type: 'postgres',
        host:
            process.env.TEST_DATABASE_HOST ??
            process.env.DATABASE_HOST ??
            'localhost',
        port: Number.isFinite(parsedPort) ? parsedPort : 5432,
        username: String(
            process.env.TEST_DATABASE_USER ??
                process.env.DATABASE_USER ??
                'postgres',
        ),
        password: String(
            process.env.TEST_DATABASE_PASSWORD ??
                process.env.DATABASE_PASSWORD ??
                '',
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

describe('UserController end-to-end', () => {
    const originalJwtSecret = process.env.JWT_SECRET;
    const originalJwtExpires = process.env.JWT_EXPIRES_IN;

    let dataSource: DataSource;
    let app: ReturnType<InversifyExpressServer['build']>;

    beforeAll(async () => {
        dataSource = await buildTestDataSource();

        const container = new Container();
        container.bind(TYPES.DB).toConstantValue(dataSource);
        container.bind(TYPES.UserRepository).to(UserRepositoryImpl);
        container
            .bind(TYPES.PasswordManagerService)
            .to(PasswordManagerServiceImpl);
        container.bind(TYPES.UserService).to(UserServiceImpl);

        const server = new InversifyExpressServer(container, null, {
            rootPath: '/partner-app/api',
        });
        server.setConfig(expressApp => {
            expressApp.use(json());
        });

        app = server.build();
    });

    beforeEach(() => {
        process.env.JWT_SECRET = 'test-secret';
        process.env.JWT_EXPIRES_IN = '15m';
    });

    afterEach(async () => {
        if (dataSource?.isInitialized) {
            await dataSource.getRepository(User).clear();
        }
        process.env.JWT_SECRET = originalJwtSecret;
        process.env.JWT_EXPIRES_IN = originalJwtExpires;
    });

    afterAll(async () => {
        if (dataSource?.isInitialized) {
            await dataSource.destroy();
        }
    });

    const registerUser = async (overrides?: Partial<{
        email: string;
        password: string;
        firstName: string;
        lastName: string;
    }>) => {
        const payload = {
            email: 'jane@example.com',
            password: 'Password1',
            firstName: 'Jane',
            lastName: 'Doe',
            ...overrides,
        };

        const response = await request(app)
            .post('/partner-app/api/users/register')
            .send(payload)
            .expect(201);

        return { payload, response };
    };

    const loginUser = async (email: string, password: string) => {
        const response = await request(app)
            .post('/partner-app/api/users/login')
            .send({ email, password })
            .expect(200);

        return response.body.token as string;
    };

    describe('POST /users/register', () => {
        it('creates the user and persists it', async () => {
            const { payload, response } = await registerUser();

            expect(response.body).toMatchObject({
                email: payload.email,
                firstName: payload.firstName,
                lastName: payload.lastName,
            });
            expect(response.body.id).toBeTruthy();
            expect(response.body.createdAt).toBeTruthy();
            expect(response.body.updatedAt).toBeTruthy();

            const persisted = await dataSource
                .getRepository(User)
                .findOne({ where: { email: payload.email } });

            expect(persisted).not.toBeNull();
            expect(persisted?.email).toBe(payload.email);
            expect(persisted?.firstName).toBe(payload.firstName);
            expect(persisted?.lastName).toBe(payload.lastName);
            expect(persisted?.password).not.toBe(payload.password);
        });

        it('rejects duplicate emails', async () => {
            await registerUser();

            const response = await request(app)
                .post('/partner-app/api/users/register')
                .send({
                    email: 'jane@example.com',
                    password: 'Password1',
                    firstName: 'Jane',
                    lastName: 'Doe',
                })
                .expect(400);

            expect(response.body).toEqual({ error: 'email already exists' });
        });
    });

    describe('POST /users/login', () => {
        it('returns a valid JWT token', async () => {
            await registerUser();

            const token = await loginUser('jane@example.com', 'Password1');
            const decoded = jwt.verify(token, 'test-secret') as {
                sub?: string;
                email?: string;
            };

            expect(decoded.sub).toBeTruthy();
            expect(decoded.email).toBe('jane@example.com');
        });

        it('rejects invalid credentials', async () => {
            await registerUser();

            const response = await request(app)
                .post('/partner-app/api/users/login')
                .send({
                    email: 'jane@example.com',
                    password: 'WrongPassword1',
                })
                .expect(401);

            expect(response.body).toEqual({ error: 'invalid credentials' });
        });
    });

    describe('GET /users/profile', () => {
        it('returns the profile for authenticated users', async () => {
            const { response } = await registerUser();
            const token = await loginUser('jane@example.com', 'Password1');

            const profileResponse = await request(app)
                .get('/partner-app/api/users/profile')
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(profileResponse.body).toEqual({
                id: response.body.id,
                email: 'jane@example.com',
                firstName: 'Jane',
                lastName: 'Doe',
                createdAt: response.body.createdAt,
                updatedAt: response.body.updatedAt,
            });
        });

        it('rejects requests without a bearer token', async () => {
            const response = await request(app)
                .get('/partner-app/api/users/profile')
                .expect(401);

            expect(response.body).toEqual({ error: 'invalid token' });
        });
    });

    describe('PUT /users/profile', () => {
        it('updates profile details for authenticated users', async () => {
            const { response } = await registerUser();
            const token = await loginUser('jane@example.com', 'Password1');

            const updateResponse = await request(app)
                .put('/partner-app/api/users/profile')
                .set('Authorization', `Bearer ${token}`)
                .send({ firstName: 'Janet', lastName: 'Doe' })
                .expect(200);

            expect(updateResponse.body).toEqual({
                id: response.body.id,
                email: 'jane@example.com',
                firstName: 'Janet',
                lastName: 'Doe',
                createdAt: response.body.createdAt,
                updatedAt: updateResponse.body.updatedAt,
            });

            const persisted = await dataSource
                .getRepository(User)
                .findOne({ where: { id: response.body.id } });

            expect(persisted?.firstName).toBe('Janet');
            expect(persisted?.lastName).toBe('Doe');
        });

        it('rejects missing tokens', async () => {
            const response = await request(app)
                .put('/partner-app/api/users/profile')
                .send({ firstName: 'Jane' })
                .expect(401);

            expect(response.body).toEqual({ error: 'invalid token' });
        });
    });
});
