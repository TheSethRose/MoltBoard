import { NextRequest, NextResponse } from "next/server";

/**
 * Standardized API Error Response Format
 * {
 *   error: string;      // Error name/type
 *   message?: string;   // Human-readable error message
 *   code?: string;      // Optional error code for programmatic handling
 * }
 */

/**
 * Error codes for consistent error identification
 */
export const ErrorCode = {
  // Validation errors (400)
  VALIDATION_ERROR: "VALIDATION_ERROR",
  MISSING_FIELD: "MISSING_FIELD",
  INVALID_FIELD: "INVALID_FIELD",
  INVALID_FORMAT: "INVALID_FORMAT",

  // Resource errors (404)
  NOT_FOUND: "NOT_FOUND",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",

  // Conflict errors (409)
  CONFLICT: "CONFLICT",

  // Server errors (500)
  INTERNAL_ERROR: "INTERNAL_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",

  // Auth errors (401/403)
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Create a standardized API error response
 */
export interface ApiErrorResponse {
  error: string;
  message?: string;
  code?: string;
}

/**
 * Custom API Error class with standardized formatting
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly error: string;
  public readonly code: string;
  public readonly message: string;

  constructor(
    statusCode: number,
    error: string,
    message: string,
    code: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.error = error;
    this.code = code;
    this.message = message;
  }

  /**
   * Convert to standardized response object
   */
  toResponse(): ApiErrorResponse {
    return {
      error: this.error,
      message: this.message,
      code: this.code,
    };
  }
}

/**
 * Common error factory functions
 */

// 400 Bad Request
export function badRequest(
  message: string,
  code: string = ErrorCode.VALIDATION_ERROR,
): ApiError {
  return new ApiError(400, "Bad Request", message, code);
}

export function validationError(message: string, code?: string): ApiError {
  return new ApiError(
    400,
    "Validation Error",
    message,
    code || ErrorCode.VALIDATION_ERROR,
  );
}

export function missingField(field: string): ApiError {
  return new ApiError(
    400,
    "Validation Error",
    `Missing required field: ${field}`,
    ErrorCode.MISSING_FIELD,
  );
}

export function invalidField(field: string, reason?: string): ApiError {
  return new ApiError(
    400,
    "Validation Error",
    `Invalid field: ${field}${reason ? ": " + reason : ""}`,
    ErrorCode.INVALID_FIELD,
  );
}

// 401 Unauthorized
export function unauthorized(
  message: string = "Authentication required",
): ApiError {
  return new ApiError(401, "Unauthorized", message, ErrorCode.UNAUTHORIZED);
}

// 403 Forbidden
export function forbidden(message: string = "Access denied"): ApiError {
  return new ApiError(403, "Forbidden", message, ErrorCode.FORBIDDEN);
}

// 404 Not Found
export function notFound(message: string, code?: string): ApiError {
  return new ApiError(404, "Not Found", message, code || ErrorCode.NOT_FOUND);
}

export function resourceNotFound(
  resource: string,
  id: string | number,
): ApiError {
  return new ApiError(
    404,
    "Not Found",
    `${resource} with id ${id} not found`,
    ErrorCode.RESOURCE_NOT_FOUND,
  );
}

// 409 Conflict
export function conflict(message: string): ApiError {
  return new ApiError(409, "Conflict", message, ErrorCode.CONFLICT);
}

// 500 Internal Server Error
export function internalError(
  message: string = "An internal error occurred",
  code?: string,
): ApiError {
  return new ApiError(
    500,
    "Internal Server Error",
    message,
    code || ErrorCode.INTERNAL_ERROR,
  );
}

export function databaseError(originalError: unknown): ApiError {
  const message =
    originalError instanceof Error
      ? originalError.message
      : String(originalError);
  return new ApiError(
    500,
    "Internal Server Error",
    `Database error: ${message}`,
    ErrorCode.DATABASE_ERROR,
  );
}

export function externalServiceError(
  service: string,
  originalError: unknown,
): ApiError {
  const message =
    originalError instanceof Error
      ? originalError.message
      : String(originalError);
  return new ApiError(
    500,
    "Internal Server Error",
    `${service} error: ${message}`,
    ErrorCode.EXTERNAL_SERVICE_ERROR,
  );
}

/**
 * Log error with context
 */
export function logError(
  error: Error | ApiError,
  context?: {
    route?: string;
    method?: string;
    requestId?: string;
    userId?: string;
    additionalInfo?: Record<string, unknown>;
    statusCode?: number;
    code?: string;
  },
): void {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
    ...context,
  };

  // In production, send to logging service
  // For now, console.error with structured output
  console.error("[API Error]", JSON.stringify(logData, null, 2));
}

/**
 * Handle an error and return a standardized NextResponse
 */
export function handleError(
  error: Error | ApiError,
): NextResponse<ApiErrorResponse> {
  // If it's already an ApiError, use its properties
  if (error instanceof ApiError) {
    logError(error, {
      route: "error-handler",
      statusCode: error.statusCode,
      code: error.code,
    });
    return NextResponse.json(error.toResponse(), { status: error.statusCode });
  }

  // For other errors, log and return 500
  logError(error);
  return NextResponse.json(
    {
      error: "Internal Server Error",
      message: "An unexpected error occurred",
      code: ErrorCode.INTERNAL_ERROR,
    },
    { status: 500 },
  );
}

/**
 * Try-catch wrapper for API route handlers
 * Automatically handles errors and returns standardized responses
 */
export function withErrorHandling<
  T,
  R,
  C = { params: Promise<Record<string, string>> },
>(
  handler: (req: T, context?: C) => Promise<R>,
  options?: {
    onError?: (error: Error | ApiError) => void;
    context?: {
      route?: string;
      method?: string;
    };
  },
): (req: T, context?: C) => Promise<R | NextResponse<ApiErrorResponse>> {
  return async (req: T, context?: C) => {
    try {
      return await handler(req, context);
    } catch (error) {
      // Log the error
      if (options?.onError) {
        options.onError(error as Error | ApiError);
      } else {
        logError(error as Error | ApiError, options?.context);
      }

      // Return standardized error response
      if (error instanceof ApiError) {
        return NextResponse.json(error.toResponse(), {
          status: error.statusCode,
        });
      }

      // Unexpected error
      return NextResponse.json(
        {
          error: "Internal Server Error",
          message: "An unexpected error occurred",
          code: ErrorCode.INTERNAL_ERROR,
        },
        { status: 500 },
      );
    }
  };
}

/**
 * Next.js App Router specific: Wrap a route handler with error handling
 * Use this as a higher-order function for GET, POST, PUT, DELETE, PATCH handlers
 */
export function createRouteHandler<
  Req extends NextRequest,
  C = { params: Promise<Record<string, string>> },
>(
  handler: (req: Req, context?: C) => Promise<NextResponse>,
): (req: Req, context?: C) => Promise<NextResponse> {
  return async (req: Req, context?: C) => {
    try {
      return await handler(req, context);
    } catch (error) {
      logError(error as Error | ApiError);
      if (error instanceof ApiError) {
        return NextResponse.json(error.toResponse(), {
          status: error.statusCode,
        });
      }
      return NextResponse.json(
        {
          error: "Internal Server Error",
          message: "An unexpected error occurred",
        },
        { status: 500 },
      );
    }
  };
}
