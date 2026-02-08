import { injectable, inject } from 'inversify';

import { User } from '../entities';
import { TYPES } from '../lib';
import { UserRepository } from '../repositories/user-repository';
import { PasswordManagerService } from './password-manager-service';

export interface RegisterUserInput {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
}

export interface UserService {
    registerUser(input: RegisterUserInput): Promise<User>;
}

const MAX_LENGTH = 50;
const PASSWORD_HASH_MAX_LENGTH = 255;

const isValidEmail = (email: string) => {
    const trimmed = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed);
};

const isStrongPassword = (password: string) => {
    if (password.length < 8) {
        return false;
    }
    if (!/[A-Z]/.test(password)) {
        return false;
    }
    if (!/[a-z]/.test(password)) {
        return false;
    }
    if (!/[0-9]/.test(password)) {
        return false;
    }
    return true;
};

const ensureRequired = (value: string, field: string) => {
    if (!value || value.trim().length === 0) {
        throw new Error(`${field} is required`);
    }
};

const ensureLengthLimit = (value: string, field: string, maxLength = MAX_LENGTH) => {
    if (value.length > maxLength) {
        throw new Error(`${field} must be ${maxLength} characters or fewer`);
    }
};

@injectable()
export class UserServiceImpl implements UserService {
    constructor(
        @inject(TYPES.UserRepository) private userRepository: UserRepository,
        @inject(TYPES.PasswordManagerService)
        private passwordManager: PasswordManagerService,
    ) {}

    async registerUser(input: RegisterUserInput): Promise<User> {
        const email = input.email?.trim();
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

        return await this.userRepository.createUser({
            email,
            password: hashedPassword,
            firstName,
            lastName,
        });
    }
}
