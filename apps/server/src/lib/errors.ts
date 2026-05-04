import { ERROR_CODES, type ErrorCode } from '@pachat/shared';
import { ZodError } from 'zod';

/**
 * The one error type the application throws. Handlers at both edges — the
 * Express error middleware and the socket acknowledgement wrapper — translate
 * it into the exact same `{ code, message, fields }` envelope, so a client
 * never has to care which transport produced a failure.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;
  /** Set for genuine bugs; suppresses the message from reaching the client. */
  readonly isInternal: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { status?: number; fields?: Record<string, string>; cause?: unknown } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? STATUS_FOR[code];
    this.isInternal = code === ERROR_CODES.internal;
    if (options.fields) this.fields = options.fields;
  }
}

const STATUS_FOR: Record<ErrorCode, number> = {
  [ERROR_CODES.unauthorized]: 401,
  [ERROR_CODES.forbidden]: 403,
  [ERROR_CODES.notFound]: 404,
  [ERROR_CODES.conflict]: 409,
  [ERROR_CODES.validation]: 422,
  [ERROR_CODES.rateLimited]: 429,
  [ERROR_CODES.protocolMismatch]: 426,
  [ERROR_CODES.payloadTooLarge]: 413,
  [ERROR_CODES.internal]: 500,
};
