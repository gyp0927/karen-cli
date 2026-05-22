export const SENSITIVE_TOOLS = ['Bash', 'Write', 'Edit'];

export interface PermissionPolicy {
  allowAll: boolean;
  allowedTools: string[];
  deniedTools: string[];
}

export const DEFAULT_POLICY: PermissionPolicy = {
  allowAll: false,
  allowedTools: [],
  deniedTools: [],
};
