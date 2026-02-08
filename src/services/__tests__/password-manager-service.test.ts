import 'reflect-metadata';
import { PasswordManagerServiceImpl } from '../password-manager-service';

describe('PasswordManagerService', () => {
    let service: PasswordManagerServiceImpl;

    beforeEach(() => {
        service = new PasswordManagerServiceImpl();
    });

    it('hashes a password with a salt', async () => {
        const hashed = await service.toHash('Password1');

        const parts = hashed.split('.');
        expect(parts).toHaveLength(2);
        expect(parts[0]).toHaveLength(32);
        expect(parts[1]).toHaveLength(128);
    });

    it('produces different hashes for the same password', async () => {
        const hashOne = await service.toHash('Password1');
        const hashTwo = await service.toHash('Password1');

        expect(hashOne).not.toBe(hashTwo);
    });

    it('returns true when supplied password matches stored hash', async () => {
        const stored = await service.toHash('Password1');

        const result = await service.compare(stored, 'Password1');

        expect(result).toBe(true);
    });

    it('returns false when supplied password does not match stored hash', async () => {
        const stored = await service.toHash('Password1');

        const result = await service.compare(stored, 'WrongPassword');

        expect(result).toBe(false);
    });

    it('returns false when stored password is malformed', async () => {
        const result = await service.compare('not-a-valid-hash', 'Password1');

        expect(result).toBe(false);
    });
});
