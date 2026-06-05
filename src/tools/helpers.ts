export interface ToolArgs extends Record<string, unknown> {}

/** Extract a required string argument, or return an error result. */
export function requireString(args: ToolArgs, key: string): string | { error: string } {
  const val = args[key];
  if (val === undefined) return { error: `Missing required argument: ${key}.` };
  return String(val);
}

/** Extract a required number argument, or return an error result. */
export function requireNumber(args: ToolArgs, key: string): number | { error: string } {
  const val = args[key];
  if (val === undefined) return { error: `Missing required argument: ${key}.` };
  const num = Number(val);
  if (isNaN(num)) return { error: `Invalid number for argument: ${key}.` };
  return num;
}

/** Extract an optional string argument. */
export function optionalString(args: ToolArgs, key: string, defaultVal = ''): string {
  const val = args[key];
  return val === undefined ? defaultVal : String(val);
}

/** Extract an optional number argument. */
export function optionalNumber(args: ToolArgs, key: string, defaultVal = 0): number {
  const val = args[key];
  if (val === undefined) return defaultVal;
  const num = Number(val);
  return isNaN(num) ? defaultVal : num;
}

/** Extract an optional boolean argument. */
export function optionalBool(args: ToolArgs, key: string, defaultVal = false): boolean {
  const val = args[key];
  return val === undefined ? defaultVal : val === true || val === 'true';
}
