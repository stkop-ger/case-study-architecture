class AuthError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
    }
}

class NotFoundError extends Error {
    readonly statusCode: number;

    constructor(message: string) {
        super(message);
        this.statusCode = 404;
    }
}

export { AuthError, NotFoundError };
