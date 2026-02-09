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

export {
    ensureLengthLimit,
    ensureRequired,
    isStrongPassword,
    isValidEmail,
    MAX_LENGTH,
    PASSWORD_HASH_MAX_LENGTH,
};
