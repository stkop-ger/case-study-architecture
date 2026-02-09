export const TYPES = {
    DB: Symbol.for('DB'),
    producer: Symbol.for('producer'),
    RedisClient: Symbol.for('RedisClient'),

    // Services
    ExampleService: Symbol.for('ExampleService'),
    UserService: Symbol.for('UserService'),
    PasswordManagerService: Symbol.for('PasswordManagerService'),

    // Repositories
    UserRepository: Symbol.for('UserRepository'),
    RefreshTokenRepository: Symbol.for('RefreshTokenRepository'),
};
