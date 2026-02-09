import 'reflect-metadata';
import jwt from 'jsonwebtoken';

import { UserServiceImpl } from '../user-service';
import { UserRepository } from '../../repositories/user-repository';
import { PasswordManagerService } from '../password-manager-service';

const buildService = (overrides?: {
    userRepository?: UserRepository;
    passwordManager?: PasswordManagerService;
}) => {
    const userRepository: UserRepository =
        overrides?.userRepository ??
        ({
            findByEmail: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            updateProfile: jest.fn(),
        } as unknown as UserRepository);

    const passwordManager: PasswordManagerService =
        overrides?.passwordManager ??
        ({
            toHash: jest.fn(),
            compare: jest.fn(),
        } as unknown as PasswordManagerService);

    return {
        service: new UserServiceImpl(userRepository, passwordManager),
        userRepository,
        passwordManager,
    };
};

describe('UserService', () => {
    const originalJwtSecret = process.env.JWT_SECRET;
    const originalJwtExpires = process.env.JWT_EXPIRES_IN;

    beforeEach(() => {
        process.env.JWT_SECRET = 'test-secret';
        process.env.JWT_EXPIRES_IN = '15m';
    });

    afterEach(() => {
        process.env.JWT_SECRET = originalJwtSecret;
        process.env.JWT_EXPIRES_IN = originalJwtExpires;
    });

    describe('register', () => {
        it('creates a user with trimmed values', async () => {
            const createdUser = {
                id: 'user-1',
                email: 'jane@example.com',
                password: 'hashed',
                firstName: 'Jane',
                lastName: 'Doe',
                createdAt: new Date('2026-02-08T10:00:00Z'),
                updatedAt: new Date('2026-02-08T10:00:00Z'),
            };

            const { service, userRepository, passwordManager } = buildService({
                userRepository: {
                    findByEmail: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue(createdUser),
                } as unknown as UserRepository,
                passwordManager: {
                    toHash: jest.fn().mockResolvedValue('hashed'),
                    compare: jest.fn(),
                } as unknown as PasswordManagerService,
            });

            const result = await service.register({
                email: '  jane@example.com ',
                password: 'Password1',
                firstName: '  Jane ',
                lastName: ' Doe  ',
            });

            expect(result).toBe(createdUser);
            expect(passwordManager.toHash).toHaveBeenCalledWith('Password1');
            expect(userRepository.create).toHaveBeenCalledWith({
                email: 'jane@example.com',
                password: 'hashed',
                firstName: 'Jane',
                lastName: 'Doe',
            });
        });

        it('rejects invalid email', async () => {
            const { service } = buildService();

            await expect(
                service.register({
                    email: 'invalid',
                    password: 'Password1',
                    firstName: 'Jane',
                    lastName: 'Doe',
                }),
            ).rejects.toThrow('email is invalid');
        });

        it('rejects weak password', async () => {
            const { service } = buildService();

            await expect(
                service.register({
                    email: 'jane@example.com',
                    password: 'password',
                    firstName: 'Jane',
                    lastName: 'Doe',
                }),
            ).rejects.toThrow(
                'password must be at least 8 characters and include uppercase, lowercase, and a number',
            );
        });

        it('rejects duplicate email', async () => {
            const { service } = buildService({
                userRepository: {
                    findByEmail: jest.fn().mockResolvedValue({ id: 'existing' }),
                } as unknown as UserRepository,
            });

            await expect(
                service.register({
                    email: 'jane@example.com',
                    password: 'Password1',
                    firstName: 'Jane',
                    lastName: 'Doe',
                }),
            ).rejects.toThrow('email already exists');
        });

        it('rejects overly long hashed password', async () => {
            const { service } = buildService({
                userRepository: {
                    findByEmail: jest.fn().mockResolvedValue(null),
                    create: jest.fn(),
                } as unknown as UserRepository,
                passwordManager: {
                    toHash: jest.fn().mockResolvedValue('a'.repeat(256)),
                    compare: jest.fn(),
                } as unknown as PasswordManagerService,
            });

            await expect(
                service.register({
                    email: 'jane@example.com',
                    password: 'Password1',
                    firstName: 'Jane',
                    lastName: 'Doe',
                }),
            ).rejects.toThrow('password must be 255 characters or fewer');
        });
    });

    describe('authenticate', () => {
        it('returns a token for valid credentials', async () => {
            const user = {
                id: 'user-1',
                email: 'jane@example.com',
                password: 'hashed',
            };

            const { service } = buildService({
                userRepository: {
                    findByEmail: jest.fn().mockResolvedValue(user),
                } as unknown as UserRepository,
                passwordManager: {
                    compare: jest.fn().mockResolvedValue(true),
                    toHash: jest.fn(),
                } as unknown as PasswordManagerService,
            });

            const signSpy = jest
                .spyOn(jwt as unknown as { sign: (...args: unknown[]) => string }, 'sign')
                .mockReturnValue('signed-token');

            const result = await service.authenticate({
                email: 'jane@example.com',
                password: 'Password1',
            });

            expect(result).toEqual({ token: 'signed-token' });
            expect(signSpy).toHaveBeenCalledWith(
                { sub: 'user-1', email: 'jane@example.com' },
                'test-secret',
                { expiresIn: '15m' },
            );

            signSpy.mockRestore();
        });

        it('rejects when JWT secret is missing', async () => {
            process.env.JWT_SECRET = '';

            const { service } = buildService({
                userRepository: {
                    findByEmail: jest.fn().mockResolvedValue({
                        id: 'user-1',
                        email: 'jane@example.com',
                        password: 'hashed',
                    }),
                } as unknown as UserRepository,
                passwordManager: {
                    compare: jest.fn().mockResolvedValue(true),
                    toHash: jest.fn(),
                } as unknown as PasswordManagerService,
            });

            try {
                await service.authenticate({
                    email: 'jane@example.com',
                    password: 'Password1',
                });
                throw new Error('Expected authenticate to throw');
            } catch (err) {
                const error = err as { message?: string; statusCode?: number };
                expect(error.message).toBe('JWT secret is not configured');
                expect(error.statusCode).toBe(500);
            }
        });

        it('rejects invalid credentials when user is missing', async () => {
            const { service } = buildService({
                userRepository: {
                    findByEmail: jest.fn().mockResolvedValue(null),
                } as unknown as UserRepository,
            });

            try {
                await service.authenticate({
                    email: 'jane@example.com',
                    password: 'Password1',
                });
                throw new Error('Expected authenticate to throw');
            } catch (err) {
                const error = err as { message?: string; statusCode?: number };
                expect(error.message).toBe('invalid credentials');
                expect(error.statusCode).toBe(401);
            }
        });

        it('rejects invalid credentials when password mismatches', async () => {
            const { service } = buildService({
                userRepository: {
                    findByEmail: jest.fn().mockResolvedValue({
                        id: 'user-1',
                        email: 'jane@example.com',
                        password: 'hashed',
                    }),
                } as unknown as UserRepository,
                passwordManager: {
                    compare: jest.fn().mockResolvedValue(false),
                    toHash: jest.fn(),
                } as unknown as PasswordManagerService,
            });

            try {
                await service.authenticate({
                    email: 'jane@example.com',
                    password: 'Password1',
                });
                throw new Error('Expected authenticate to throw');
            } catch (err) {
                const error = err as { message?: string; statusCode?: number };
                expect(error.message).toBe('invalid credentials');
                expect(error.statusCode).toBe(401);
            }
        });
    });

    describe('getProfile', () => {
        it('returns the user when found', async () => {
            const user = { id: 'user-1', email: 'jane@example.com' };
            const { service } = buildService({
                userRepository: {
                    findById: jest.fn().mockResolvedValue(user),
                } as unknown as UserRepository,
            });

            await expect(service.getProfile('user-1')).resolves.toBe(user);
        });

        it('throws not found when missing', async () => {
            const { service } = buildService({
                userRepository: {
                    findById: jest.fn().mockResolvedValue(null),
                } as unknown as UserRepository,
            });

            try {
                await service.getProfile('missing');
                throw new Error('Expected getProfile to throw');
            } catch (err) {
                const error = err as { message?: string; statusCode?: number };
                expect(error.message).toBe('user not found');
                expect(error.statusCode).toBe(404);
            }
        });
    });

    describe('updateProfile', () => {
        it('updates provided fields with trimmed values', async () => {
            const updatedUser = {
                id: 'user-1',
                firstName: 'Jane',
                lastName: 'Doe',
            };

            const { service, userRepository } = buildService({
                userRepository: {
                    updateProfile: jest.fn().mockResolvedValue(updatedUser),
                } as unknown as UserRepository,
            });

            const result = await service.updateProfile('user-1', {
                firstName: '  Jane  ',
                lastName: ' Doe ',
            });

            expect(result).toBe(updatedUser);
            expect(userRepository.updateProfile).toHaveBeenCalledWith('user-1', {
                firstName: 'Jane',
                lastName: 'Doe',
            });
        });

        it('rejects when no fields are provided', async () => {
            const { service } = buildService();

            await expect(service.updateProfile('user-1', {})).rejects.toThrow(
                'firstName or lastName is required',
            );
        });

        it('rejects blank firstName when lastName is provided', async () => {
            const { service } = buildService();

            await expect(
                service.updateProfile('user-1', {
                    firstName: '   ',
                    lastName: 'Doe',
                }),
            ).rejects.toThrow('firstName is required');
        });

        it('rejects overly long lastName', async () => {
            const { service } = buildService();

            await expect(
                service.updateProfile('user-1', { lastName: 'a'.repeat(51) }),
            ).rejects.toThrow('lastName must be 50 characters or fewer');
        });

        it('throws not found when repository returns null', async () => {
            const { service } = buildService({
                userRepository: {
                    updateProfile: jest.fn().mockResolvedValue(null),
                } as unknown as UserRepository,
            });

            try {
                await service.updateProfile('missing', { firstName: 'Jane' });
                throw new Error('Expected updateProfile to throw');
            } catch (err) {
                const error = err as { message?: string; statusCode?: number };
                expect(error.message).toBe('user not found');
                expect(error.statusCode).toBe(404);
            }
        });
    });
});
