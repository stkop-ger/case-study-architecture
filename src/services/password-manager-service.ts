import { scrypt, randomBytes } from 'crypto';
import { injectable } from 'inversify';
import { promisify } from 'util';

export interface PasswordManagerService {
    toHash(password: string): Promise<string>;
    compare(storedPassword: string, suppliedPassword: string): Promise<boolean>;
}

const scryptAsync = promisify(scrypt);

/**
 * A utility class to hash user password before storing in DB
 * and compares user supplied passowrd with the stored hash
 */
@injectable()
export class PasswordManagerServiceImpl implements PasswordManagerService {
    async toHash(password: string) {
        const salt = randomBytes(16).toString('hex');
        const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
        return `${salt}.${derivedKey.toString('hex')}`;
    }

    async compare(storedPassword: string, suppliedPassword: string) {
        const [salt, storedHash] = storedPassword.split('.');
        if (!salt || !storedHash) {
            return false;
        }
        const derivedKey = (await scryptAsync(suppliedPassword, salt, 64)) as Buffer;
        return storedHash === derivedKey.toString('hex');
    }
}
