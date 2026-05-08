export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public override readonly cause?: unknown;

  constructor(message: string, opts: { code: string; statusCode: number; cause?: unknown }) {
    super(message);
    this.name = this.constructor.name;
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.cause = opts.cause;
  }
}

export class EnvValidationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, { code: 'ENV_VALIDATION_ERROR', statusCode: 500, cause });
  }
}

