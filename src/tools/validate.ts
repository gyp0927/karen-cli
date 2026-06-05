import { ToolResult, ErrorCode } from '../core/types.js';

/**
 * Map common error patterns to structured error codes.
 */
function classifyError(error: string): ErrorCode {
  const lower = error.toLowerCase();
  if (lower.includes('permission') || lower.includes('denied') || lower.includes('eacces')) {
    return 'PERMISSION_DENIED';
  }
  if (lower.includes('not found') || lower.includes('enoent') || lower.includes('does not exist')) {
    return 'NOT_FOUND';
  }
  if (lower.includes('timeout') || lower.includes('etimedout')) {
    return 'TIMEOUT';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'RATE_LIMITED';
  }
  if (lower.includes('network') || lower.includes('econnreset') || lower.includes('enotfound')) {
    return 'NETWORK_ERROR';
  }
  if (lower.includes('invalid') || lower.includes('bad request') || lower.includes('einvalid')) {
    return 'INVALID_INPUT';
  }
  return 'INTERNAL_ERROR';
}

/**
 * Validate and sanitize a tool result to ensure consistent shape.
 * Catches common mistakes like returning non-string output or missing success flag.
 * Adds structured error codes for programmatic handling.
 *
 * Returns a NEW object — does not mutate the input.
 */
export function validateResult(result: ToolResult): ToolResult {
  // Start with a shallow copy to avoid mutating the original
  const validated: ToolResult = { ...result };

  // Ensure output is always a string
  if (typeof validated.output !== 'string') {
    validated.output = String(validated.output ?? '');
  }

  // Truncate excessively long output (100KB max per result)
  const MAX_OUTPUT = 100_000;
  if (validated.output.length > MAX_OUTPUT) {
    validated.output = validated.output.slice(0, MAX_OUTPUT) +
      '\n[... output truncated at 100KB ...]';
  }

  // Ensure success is boolean
  if (typeof validated.success !== 'boolean') {
    validated.success = !validated.error;
  }

  // If there's an error but success is true, something is wrong
  if (validated.error && validated.success) {
    validated.success = false;
  }

  // Add structured error code for programmatic handling
  if (!validated.success && validated.error && !validated.errorCode) {
    validated.errorCode = classifyError(validated.error);
  }

  return validated;
}
