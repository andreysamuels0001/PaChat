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

export const unauthorized = (message = 'Authentication required') =>
  new AppError(ERROR_CODES.unauthorized, message);

export const forbidden = (message = 'You do not have access to that') =>
  new AppError(ERROR_CODES.forbidden, message);

export const notFound = (message = 'Not found') => new AppError(ERROR_CODES.notFound, message);

export const conflict = (message: string, fields?: Record<string, string>) =>
  new AppError(ERROR_CODES.conflict, message, fields ? { fields } : {});

export const validationFailed = (message: string, fields?: Record<string, string>) =>
  new AppError(ERROR_CODES.validation, message, fields ? { fields } : {});

export const rateLimited = (message = 'Too many requests — slow down') =>
  new AppError(ERROR_CODES.rateLimited, message);

export const internal = (message: string, cause?: unknown) =>
  new AppError(ERROR_CODES.internal, message, cause !== undefined ? { cause } : {});

/** Flattens a Zod failure into `{ 'path.to.field': 'reason' }`. */
export function fieldsFromZod(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

/** Normalises anything thrown anywhere into an `AppError`. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return validationFailed('Some fields need attention', fieldsFromZod(error));
  }
  if (error instanceof Error) return internal(error.message, error);
  return internal('Unexpected error', error);
}

/**
 * The client-safe projection of an error. Internal failures are deliberately
 * flattened to a generic sentence so stack traces and SQL text never leak.
 */
export function publicShape(error: AppError): {
  code: ErrorCode;
  message: string;
  fields?: Record<string, string>;
} {
  const message = error.isInternal ? 'Something went wrong on our side' : error.message;
  return error.fields
    ? { code: error.code, message, fields: error.fields }
    : { code: error.code, message };
}
