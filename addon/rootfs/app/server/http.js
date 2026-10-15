export class HttpError extends Error {
    // Declared and assigned rather than using parameter properties: Node runs
    // these files with --experimental-strip-types, which erases types without
    // generating code, and a parameter property needs generated assignments.
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.code = code;
    }
}
export const badRequest = (message) => new HttpError(400, 'bad_request', message);
export const notFound = (message) => new HttpError(404, 'not_found', message);
export function sendError(res, status, code, message) {
    res.status(status).json({ error: { code, message } });
}
/**
 * Express 5 forwards a rejected promise to the error handler on its own, but
 * only for handlers it recognises as async. Wrapping keeps that guarantee
 * explicit and survives a handler later being refactored to return a promise.
 */
export function asyncHandler(handler) {
    return (req, res, next) => {
        handler(req, res, next).catch(next);
    };
}
export function requestLogger() {
    return (req, res, next) => {
        const started = process.hrtime.bigint();
        res.on('finish', () => {
            const ms = Number(process.hrtime.bigint() - started) / 1e6;
            console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
        });
        next();
    };
}
function bodyParserFailure(error) {
    const candidate = error;
    const status = candidate?.status ?? candidate?.statusCode;
    if (typeof status !== 'number' || !candidate?.type)
        return null;
    switch (candidate.type) {
        case 'entity.parse.failed':
            return { status: 400, code: 'invalid_json' };
        case 'entity.too.large':
            return { status: 413, code: 'payload_too_large' };
        case 'encoding.unsupported':
            return { status: 415, code: 'unsupported_encoding' };
        default:
            return status >= 400 && status < 500 ? { status, code: 'bad_request' } : null;
    }
}
export function errorHandler(isProduction) {
    return (error, _req, res, _next) => {
        if (error instanceof HttpError) {
            sendError(res, error.status, error.code, error.message);
            return;
        }
        const parseFailure = bodyParserFailure(error);
        if (parseFailure) {
            sendError(res, parseFailure.status, parseFailure.code, error.message);
            return;
        }
        console.error('Unhandled error:', error);
        sendError(res, 500, 'internal_error', 
        // A stack trace is useful on a laptop and is an information leak in the
        // add-on, where the message goes straight to the browser.
        isProduction ? 'Something went wrong.' : String(error?.stack ?? error));
    };
}
//# sourceMappingURL=http.js.map