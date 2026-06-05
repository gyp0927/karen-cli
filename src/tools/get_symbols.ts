import { Tool, ToolResult } from '../core/types.js';
import { readFileSync } from 'fs';
import { safePath } from '../utils/paths.js';

interface SymbolInfo {
  name: string;
  kind: 'class' | 'function' | 'method' | 'interface' | 'type' | 'enum' | 'variable' | 'namespace';
  line: number;
  parent?: string;
  exported: boolean;
}

/** Escape special regex characters in a string. */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTypeScriptSymbols(content: string): SymbolInfo[] {
  const lines = content.split('\n');
  const symbols: SymbolInfo[] = [];
  let inJsDoc = false;
  let braceDepth = 0;
  const classStack: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i];
    const trimmed = raw.trim();

    // Track JSDoc
    if (trimmed.startsWith('/**')) { inJsDoc = true; continue; }
    if (inJsDoc) { if (trimmed.includes('*/')) inJsDoc = false; continue; }

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed === '*') continue;

    // Track brace depth for class context
    const opens = (trimmed.match(/{/g) || []).length;
    const closes = (trimmed.match(/}/g) || []).length;
    braceDepth += opens - closes;
    if (braceDepth < 0) braceDepth = 0;

    const exported = trimmed.startsWith('export ');

    // class
    const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      classStack.push(classMatch[1]);
      symbols.push({ name: classMatch[1], kind: 'class', line: lineNum, exported });
      continue;
    }

    // interface
    const ifaceMatch = trimmed.match(/^(?:export\s+)?interface\s+(\w+)/);
    if (ifaceMatch) { symbols.push({ name: ifaceMatch[1], kind: 'interface', line: lineNum, exported }); continue; }

    // type
    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+(\w+)/);
    if (typeMatch) { symbols.push({ name: typeMatch[1], kind: 'type', line: lineNum, exported }); continue; }

    // enum
    const enumMatch = trimmed.match(/^(?:export\s+)?enum\s+(\w+)/);
    if (enumMatch) { symbols.push({ name: enumMatch[1], kind: 'enum', line: lineNum, exported }); continue; }

    // function
    const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) { symbols.push({ name: funcMatch[1], kind: 'function', line: lineNum, exported }); continue; }

    // Method inside class: word( or word< at class indentation (2+ spaces)
    if (classStack.length > 0 && braceDepth > 0) {
      const indent = raw.match(/^(\s*)/)?.[1].length || 0;
      if (indent >= 2) {
        const methodMatch = trimmed.match(/^(?:(?:public|private|protected|static|async|readonly|abstract)\s+)*(\w+)\s*[<(]/);
        if (methodMatch && !/^(if|for|while|switch|return|throw|new|try|catch|else|case|default|break|continue|import|export|typeof|instanceof|let|const|var)$/.test(methodMatch[1])) {
          symbols.push({ name: methodMatch[1], kind: 'method', line: lineNum, parent: classStack[classStack.length - 1], exported: false });
          continue;
        }
      }
    }

    // Top-level variable (indent 0-2, not exported function/class)
    if (braceDepth === 0 && classStack.length === 0) {
      const varMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)/);
      if (varMatch && raw.match(/^\s{0,2}/)) {
        symbols.push({ name: varMatch[1], kind: 'variable', line: lineNum, exported });
        continue;
      }
    }
  }

  return symbols;
}

function parsePythonSymbols(content: string): SymbolInfo[] {
  const lines = content.split('\n');
  const symbols: SymbolInfo[] = [];
  let currentClass: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const classMatch = trimmed.match(/^class\s+(\w+)/);
    if (classMatch) {
      currentClass = classMatch[1];
      symbols.push({ name: currentClass, kind: 'class', line: lineNum, exported: true });
      continue;
    }

    const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
    if (funcMatch) {
      const indent = raw.match(/^(\s*)/)?.[1].length || 0;
      const isMethod = indent > 0 && currentClass !== null;
      symbols.push({
        name: funcMatch[1],
        kind: isMethod ? 'method' : 'function',
        line: lineNum,
        parent: isMethod ? currentClass! : undefined,
        exported: !trimmed.startsWith('_'),
      });
      continue;
    }
  }

  return symbols;
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'typescript';
  if (['py'].includes(ext)) return 'python';
  return 'unknown';
}

export function createGetSymbolsTool(): Tool {
  return {
    name: 'get_symbols',
    description: 'Extract symbols (classes, functions, methods, interfaces, types, enums) from source files. Supports filtering by kind and finding references to a specific name. Use this to understand code structure without reading the entire file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the source file.' },
        name: { type: 'string', description: 'Optional. Find a specific identifier (e.g. "AgentLoop", "run"). Returns all references, calls, and the definition.' },
        kind: { type: 'string', enum: ['any', 'call', 'definition', 'reference'], description: 'When name is provided: any (all matches), call (function call sites), definition (declaration), reference (other uses). Default: any.' },
      },
      required: ['path'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const rawPath = String(args.path || '');

      if (!rawPath) {
        return { success: false, output: '', error: 'Missing path argument.' };
      }

      const filePath = safePath(rawPath);
      if (!filePath) {
        return { success: false, output: '', error: 'Invalid or unsafe file path.' };
      }

      try {
        const content = readFileSync(filePath, 'utf8');
        const lang = detectLanguage(filePath);

        let symbols: SymbolInfo[];
        if (lang === 'typescript') {
          symbols = parseTypeScriptSymbols(content);
        } else if (lang === 'python') {
          symbols = parsePythonSymbols(content);
        } else {
          return { success: false, output: '', error: `Unsupported file type. Supported: .ts, .tsx, .js, .jsx, .py` };
        }

        // Filter by name if provided
        const searchName = args.name ? String(args.name) : '';
        if (searchName) {
          const kindFilter = String(args.kind || 'any');
          const lines = content.split('\n');
          const results: string[] = [];

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

            // Check if this line contains the identifier
            const escaped = escapeRegExp(searchName);
            const regex = new RegExp(`\\b${escaped}\\b`);
            if (!regex.test(trimmed)) continue;

            const lineNum = i + 1;
            const isDef = /^(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s/.test(trimmed) && trimmed.includes(searchName);
            const isCall = new RegExp(`\\b${escaped}\\s*\\(`).test(trimmed) && !isDef;

            let matchKind = 'reference';
            if (isDef) matchKind = 'definition';
            else if (isCall) matchKind = 'call';

            if (kindFilter !== 'any' && matchKind !== kindFilter) continue;

            results.push(`${filePath}:${lineNum}: [${matchKind}] ${trimmed.slice(0, 120)}`);
          }

          if (results.length === 0) {
            return { success: true, output: `No matches for "${searchName}"${kindFilter !== 'any' ? ` (kind: ${kindFilter})` : ''} in ${filePath}.` };
          }

          return {
            success: true,
            output: `${results.length} match(es) for "${searchName}" in ${filePath}:\n${results.join('\n')}`,
          };
        }

        if (symbols.length === 0) {
          return { success: true, output: 'No symbols found.' };
        }

        const treeLines: string[] = [];
        for (const s of symbols) {
          const prefix = s.parent ? '  ' : '';
          const exp = s.exported ? 'export ' : '';
          const parentInfo = s.parent ? ` (in ${s.parent})` : '';
          treeLines.push(`${prefix}${exp}${s.kind} ${s.name} :${s.line}${parentInfo}`);
        }

        return {
          success: true,
          output: `${symbols.length} symbol(s) in ${filePath}:\n${treeLines.join('\n')}`,
        };
      } catch (err) {
        return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
