import { Tool, ToolResult } from '../core/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';

interface McpServerConfig {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

interface McpConfig {
  servers: McpServerConfig[];
}

const MCP_CONFIG_PATH = join(homedir(), '.karen', 'mcp.json');

/** Type guard to validate parsed MCP config shape at runtime. */
function isMcpConfig(value: unknown): value is McpConfig {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.servers)) return false;
  for (const s of obj.servers) {
    if (!s || typeof s !== 'object') return false;
    const server = s as Record<string, unknown>;
    if (typeof server.name !== 'string') return false;
    if (server.command !== undefined && typeof server.command !== 'string') return false;
    if (server.args !== undefined && !Array.isArray(server.args)) return false;
    if (server.env !== undefined && typeof server.env !== 'object') return false;
    if (server.url !== undefined && typeof server.url !== 'string') return false;
  }
  return true;
}

function loadMcpConfig(): McpConfig {
  if (!existsSync(MCP_CONFIG_PATH)) {
    return { servers: [] };
  }
  try {
    const content = readFileSync(MCP_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(content);
    if (isMcpConfig(parsed)) {
      return parsed;
    }
    return { servers: [] };
  } catch {
    return { servers: [] };
  }
}

function saveMcpConfig(config: McpConfig): void {
  const dir = join(homedir(), '.karen');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

class McpClientManager {
  private clients = new Map<string, { client: Client; tools: ListToolsResult['tools'] }>();

  async connect(server: McpServerConfig): Promise<string> {
    const client = new Client({ name: 'karen-cli', version: '0.1.0' });

    const connectTimeoutMs = 30_000;
    if (server.url) {
      // Auto-detect transport: SSE (EventSource) vs StreamableHTTP
      const urlStr = server.url;
      const transport = urlStr.includes('/sse') || urlStr.endsWith('/events')
        ? new SSEClientTransport(new URL(urlStr))
        : new StreamableHTTPClientTransport(new URL(urlStr));
      await Promise.race([
        client.connect(transport),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Connect to ${server.name} timed out after ${connectTimeoutMs}ms`)), connectTimeoutMs)),
      ]);
    } else if (server.command) {
      // Only pass safe env vars to MCP child processes (filter out secrets)
      const safeKeys = ['PATH', 'HOME', 'USER', 'TMP', 'TEMP', 'TMPDIR', 'SHELL', 'LANG', 'LC_ALL', 'NODE_PATH', 'PYTHONPATH'];
      const env: Record<string, string> = {};
      for (const k of safeKeys) {
        const val = process.env[k];
        if (val !== undefined) env[k] = val;
      }
      // Merge server-specific env overrides
      if (server.env) {
        for (const [k, v] of Object.entries(server.env)) {
          if (v !== undefined) env[k] = v;
        }
      }
      const transport = new StdioClientTransport({
        command: server.command,
        args: server.args || [],
        env,
      });
      await Promise.race([
        client.connect(transport),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Connect to ${server.name} timed out after ${connectTimeoutMs}ms`)), connectTimeoutMs)),
      ]);
    } else {
      throw new Error('Server must have either "command" or "url"');
    }

    const toolsResult = await client.listTools();
    this.clients.set(server.name, { client, tools: toolsResult.tools });
    return `Connected to ${server.name} with ${toolsResult.tools.length} tools`;
  }

  async disconnect(name: string): Promise<void> {
    const entry = this.clients.get(name);
    if (entry) {
      await entry.client.close();
      this.clients.delete(name);
    }
  }

  getAllTools(): Array<{ server: string; tool: ListToolsResult['tools'][number] }> {
    const all: Array<{ server: string; tool: ListToolsResult['tools'][number] }> = [];
    for (const [server, entry] of this.clients) {
      for (const tool of entry.tools) {
        all.push({ server, tool });
      }
    }
    return all;
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const entry = this.clients.get(serverName);
    if (!entry) {
      return { success: false, output: '', error: `Server "${serverName}" not connected.` };
    }

    try {
      const result = await entry.client.callTool(
        { name: toolName, arguments: args }
      );

      let output = '';
      const contents = result.content as Array<{ type: string; text?: string; mimeType?: string }>;
      for (const content of contents) {
        if (content.type === 'text') {
          output += content.text;
        } else if (content.type === 'image') {
          output += `[Image: ${content.mimeType}]`;
        }
      }

      return { success: true, output };
    } catch (err) {
      return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
    }
  }

  listConnected(): string[] {
    return Array.from(this.clients.keys());
  }
}

const manager = new McpClientManager();

export function createMcpTool(): Tool {
  return {
    name: 'MCP',
    description: 'Manage MCP (Model Context Protocol) servers: connect, disconnect, list, call tools from external servers like browsers, databases, or Slack.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['connect', 'disconnect', 'list', 'call', 'add_config', 'remove_config'],
          description: 'Operation: connect to a server, disconnect, list connected/capabilities, call a tool, or manage config.',
        },
        name: {
          type: 'string',
          description: 'Server name for connect/disconnect/call/config operations.',
        },
        command: {
          type: 'string',
          description: 'For "connect" or "add_config": command to run (e.g., "npx", "docker").',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'For "connect" or "add_config": command arguments.',
        },
        url: {
          type: 'string',
          description: 'For "connect" or "add_config": SSE URL instead of command.',
        },
        tool: {
          type: 'string',
          description: 'For "call": the tool name to invoke.',
        },
        arguments: {
          type: 'object',
          description: 'For "call": arguments to pass to the tool.',
        },
      },
      required: ['operation'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const operation = String(args.operation);

      switch (operation) {
        case 'connect': {
          const name = String(args.name || '');
          if (!name) return { success: false, output: '', error: 'Missing "name".' };

          const config = loadMcpConfig();
          const serverConfig = config.servers.find(s => s.name === name);
          if (!serverConfig) {
            return { success: false, output: '', error: `Server "${name}" not found in config. Use MCP add_config first.` };
          }

          try {
            const result = await manager.connect(serverConfig);
            return { success: true, output: result };
          } catch (err) {
            return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
          }
        }
        case 'disconnect': {
          const name = String(args.name || '');
          if (!name) return { success: false, output: '', error: 'Missing "name".' };
          await manager.disconnect(name);
          return { success: true, output: `Disconnected ${name}.` };
        }
        case 'list': {
          const connected = manager.listConnected();
          const allTools = manager.getAllTools();
          let output = `Connected servers: ${connected.join(', ') || 'none'}\n\n`;
          output += `Available MCP tools (${allTools.length}):\n`;
          for (const { server, tool } of allTools) {
            output += `  [${server}] ${tool.name}: ${tool.description || 'No description'}\n`;
          }
          return { success: true, output };
        }
        case 'call': {
          const name = String(args.name || '');
          const tool = String(args.tool || '');
          const toolArgs = (args.arguments as Record<string, unknown>) || {};
          if (!name || !tool) {
            return { success: false, output: '', error: 'Missing "name" or "tool".' };
          }
          return manager.callTool(name, tool, toolArgs);
        }
        case 'add_config': {
          const name = String(args.name || '');
          if (!name) return { success: false, output: '', error: 'Missing "name".' };

          const config = loadMcpConfig();
          if (config.servers.some(s => s.name === name)) {
            return { success: false, output: '', error: `Server "${name}" already exists in config.` };
          }

          const newServer: McpServerConfig = { name };
          if (args.url) {
            newServer.url = String(args.url);
          } else if (args.command) {
            newServer.command = String(args.command);
            newServer.args = Array.isArray(args.args) ? args.args.map(String) : [];
          } else {
            return { success: false, output: '', error: 'Must provide "command" or "url".' };
          }

          config.servers.push(newServer);
          saveMcpConfig(config);
          return { success: true, output: `Added server "${name}" to MCP config.` };
        }
        case 'remove_config': {
          const name = String(args.name || '');
          if (!name) return { success: false, output: '', error: 'Missing "name".' };

          const config = loadMcpConfig();
          config.servers = config.servers.filter(s => s.name !== name);
          saveMcpConfig(config);
          return { success: true, output: `Removed server "${name}" from MCP config.` };
        }
        default:
          return { success: false, output: '', error: `Unknown operation: ${operation}` };
      }
    },
  };
}

export function getMcpManager(): McpClientManager {
  return manager;
}
