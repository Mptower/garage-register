/**
 * HTTP plumbing: consistent error shapes, request logging, async wrapping.
 */
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';

export class HttpError extends Error {
  // Declared and assigned rather than using parameter properties: Node runs
  // these files with --experimental-strip-types, which erases types without
  // generating code, and a parameter property needs generated assignments.
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string) => new HttpError(400, 'bad_request', message);
export const notFound = (message: string) => new HttpError(404, 'not_found', message);

export function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

/**
 * Express 5 forwards a rejected promise to the error handler on its own, but
 * only for handlers it recognises as async. Wrapping keeps that guarantee
 * explicit and survives a handler later being refactored to return a promise.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export function requestLogger(): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
  };
}

/**
 * Body-parser rejects malformed or oversized JSON by throwing an error that
 * already carries the right status. Without this it falls through to the
 * catch-all and a client's typo comes back as a 500 with a stack trace.
 */
interface BodyParserError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

function bodyParserFailure(error: unknown): { status: number; code: string } | null {
  const candidate = error as BodyParserError;
  const status = candidate?.status ?? candidate?.statusCode;
  if (typeof status !== 'number' || !candidate?.type) return null;

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

export function errorHandler(isProduction: boolean): ErrorRequestHandler {
  return (error, _req, res, _next) => {
    if (error instanceof HttpError) {
      sendError(res, error.status, error.code, error.message);
      return;
    }

    const parseFailure = bodyParserFailure(error);
    if (parseFailure) {
      sendError(res, parseFailure.status, parseFailure.code, (error as Error).message);
      return;
    }

    console.error('Unhandled error:', error);
    sendError(
      res,
      500,
      'internal_error',
      // A stack trace is useful on a laptop and is an information leak in the
      // add-on, where the message goes straight to the browser.
      isProduction ? 'Something went wrong.' : String((error as Error)?.stack ?? error),
    );
  };
}
