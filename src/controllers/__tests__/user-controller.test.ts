import 'reflect-metadata';
import { json } from 'body-parser';
import { Container } from 'inversify';
import { InversifyExpressServer } from 'inversify-express-utils';
import request from 'supertest';

import { TYPES } from '../../lib';
import { UserServiceImpl } from '../../services/user-service';
import { UserRepository } from '../../repositories/user-repository';
import { PasswordManagerService } from '../../services/password-manager-service';

import '../user-controller';

const buildApp = (overrides?: {
    userRepository?: UserRepository;
    passwordManager?: PasswordManagerService;
}) => {
    const container = new Container();

    const userRepository: UserRepository =
        overrides?.userRepository ??
        ({
            findByEmail: jest.fn().mockResolvedValue(null),
            createUser: jest.fn(),
        } as unknown as UserRepository);

    const passwordManager: PasswordManagerService =
        overrides?.passwordManager ??
        ({
            toHash: jest.fn().mockResolvedValue('salt.hash'),
            compare: jest.fn(),
        } as unknown as PasswordManagerService);

    container
        .bind<UserRepository>(TYPES.UserRepository)
        .toConstantValue(userRepository);
    container
        .bind<PasswordManagerService>(TYPES.PasswordManagerService)
        .toConstantValue(passwordManager);
    container.bind(TYPES.UserService).to(UserServiceImpl);

    const server = new InversifyExpressServer(container, null, {
        rootPath: '/partner-app/api',
    });
    server.setConfig(app => {
        app.use(json());
    });

    return {
        app: server.build(),
        userRepository,
        passwordManager,
    };
};

describe('POST /partner-app/api/users/register', () => {
    const longValue = 'a'.repeat(51);

    it('creates a user and returns a sanitized response', async () => {
        const createdUser = {
            id: 'user-1',
            email: 'jane@example.com',
            password: 'salt.hash',
            firstName: 'Jane',
            lastName: 'Doe',
            createdAt: new Date('2026-02-08T10:00:00Z'),
            updatedAt: new Date('2026-02-08T10:00:00Z'),
        };

        const { app, userRepository, passwordManager } = buildApp({
            userRepository: {
                findByEmail: jest.fn().mockResolvedValue(null),
                createUser: jest.fn().mockResolvedValue(createdUser),
            } as unknown as UserRepository,
            passwordManager: {
                toHash: jest.fn().mockResolvedValue('salt.hash'),
                compare: jest.fn(),
            } as unknown as PasswordManagerService,
        });

        const response = await request(app)
            .post('/partner-app/api/users/register')
            .send({
                email: 'jane@example.com',
                password: 'Password1',
                firstName: 'Jane',
                lastName: 'Doe',
            });

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            id: 'user-1',
            email: 'jane@example.com',
            firstName: 'Jane',
            lastName: 'Doe',
            createdAt: createdUser.createdAt.toISOString(),
            updatedAt: createdUser.updatedAt.toISOString(),
        });

        expect(passwordManager.toHash).toHaveBeenCalledWith('Password1');
        expect(userRepository.createUser).toHaveBeenCalledWith({
            email: 'jane@example.com',
            password: 'salt.hash',
            firstName: 'Jane',
            lastName: 'Doe',
        });
    });

    it('rejects invalid email', async () => {
        const { app, userRepository, passwordManager } = buildApp();

        const response = await request(app)
            .post('/partner-app/api/users/register')
            .send({
                email: 'invalid',
                password: 'Password1',
                firstName: 'Jane',
                lastName: 'Doe',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'email is invalid' });
        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(passwordManager.toHash).not.toHaveBeenCalled();
    });

    it('rejects duplicate email', async () => {
        const { app, userRepository, passwordManager } = buildApp({
            userRepository: {
                findByEmail: jest.fn().mockResolvedValue({ id: 'existing' }),
                createUser: jest.fn(),
            } as unknown as UserRepository,
        });

        const response = await request(app)
            .post('/partner-app/api/users/register')
            .send({
                email: 'jane@example.com',
                password: 'Password1',
                firstName: 'Jane',
                lastName: 'Doe',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'email already exists' });
        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(passwordManager.toHash).not.toHaveBeenCalled();
    });

    it('rejects weak password', async () => {
        const { app, userRepository, passwordManager } = buildApp();

        const response = await request(app)
            .post('/partner-app/api/users/register')
            .send({
                email: 'jane@example.com',
                password: 'password',
                firstName: 'Jane',
                lastName: 'Doe',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: 'password must be at least 8 characters and include uppercase, lowercase, and a number',
        });
        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(passwordManager.toHash).not.toHaveBeenCalled();
    });

    it('rejects missing email', async () => {
        const { app, userRepository, passwordManager } = buildApp();

        const response = await request(app)
            .post('/partner-app/api/users/register')
            .send({
                password: 'Password1',
                firstName: 'Jane',
                lastName: 'Doe',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'email is required' });
        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(passwordManager.toHash).not.toHaveBeenCalled();
    });

    it('rejects missing password', async () => {
        const { app, userRepository, passwordManager } = buildApp();

        const response = await request(app)
            .post('/partner-app/api/users/register')
            .send({
                email: 'jane@example.com',
                firstName: 'Jane',
                lastName: 'Doe',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'password is required' });
        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(passwordManager.toHash).not.toHaveBeenCalled();
    });

    it('rejects missing firstName', async () => {
        const { app, userRepository, passwordManager } = buildApp();

        const response = await request(app)
            .post('/partner-app/api/users/register')
            .send({
                email: 'jane@example.com',
                password: 'Password1',
                lastName: 'Doe',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'firstName is required' });
        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(passwordManager.toHash).not.toHaveBeenCalled();
    });

    it('rejects missing lastName', async () => {
        const { app, userRepository, passwordManager } = buildApp();

        const response = await request(app)
            .post('/partner-app/api/users/register')
            .send({
                email: 'jane@example.com',
                password: 'Password1',
                firstName: 'Jane',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'lastName is required' });
        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(passwordManager.toHash).not.toHaveBeenCalled();
    });

    it('rejects email longer than 50 characters', async () => {
        const { app, userRepository, passwordManager } = buildApp();

        const response = await request(app)
            .post('/partner-app/api/users/register')
            .send({
                email: `${longValue}@example.com`,
                password: 'Password1',
                firstName: 'Jane',
                lastName: 'Doe',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: 'email must be 50 characters or fewer',
        });
        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(passwordManager.toHash).not.toHaveBeenCalled();
    });

    it('rejects password longer than 50 characters', async () => {
        const { app, userRepository, passwordManager } = buildApp();

        const response = await request(app)
            .post('/partner-app/api/users/register')
            .send({
                email: 'jane@example.com',
                password: `A${longValue}1`,
                firstName: 'Jane',
                lastName: 'Doe',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: 'password must be 50 characters or fewer',
        });
        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(passwordManager.toHash).not.toHaveBeenCalled();
    });

    it('rejects firstName longer than 50 characters', async () => {
        const { app, userRepository, passwordManager } = buildApp();

        const response = await request(app)
            .post('/partner-app/api/users/register')
            .send({
                email: 'jane@example.com',
                password: 'Password1',
                firstName: longValue,
                lastName: 'Doe',
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: 'firstName must be 50 characters or fewer',
        });
        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(passwordManager.toHash).not.toHaveBeenCalled();
    });

    it('rejects lastName longer than 50 characters', async () => {
        const { app, userRepository, passwordManager } = buildApp();

        const response = await request(app)
            .post('/partner-app/api/users/register')
            .send({
                email: 'jane@example.com',
                password: 'Password1',
                firstName: 'Jane',
                lastName: longValue,
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: 'lastName must be 50 characters or fewer',
        });
        expect(userRepository.createUser).not.toHaveBeenCalled();
        expect(passwordManager.toHash).not.toHaveBeenCalled();
    });
});
