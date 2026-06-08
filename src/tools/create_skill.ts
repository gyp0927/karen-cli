import { Tool, ToolResult } from '../core/types.js';
import { SkillManager } from '../skills/manager.js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../utils/paths.js';

export function createCreateSkillTool(skillManager: SkillManager, onChange?: () => void): Tool {
  return {
    name: 'create_skill',
    description: 'Author and save a new skill. Skills are reusable prompt modules stored as .md files. Once created, the skill is immediately available for keyword-based triggering.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Identifier — letters/digits/_- only, e.g. "debug-helper".' },
        description: { type: 'string', description: 'One-liner shown when listing skills.' },
        body: { type: 'string', description: 'Markdown playbook — the prompt content that gets injected when this skill triggers.' },
        trigger: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keywords that trigger this skill (e.g. ["debug", "fix test"]).',
        },
      },
      required: ['name', 'description', 'body'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const name = String(args.name || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
      const description = String(args.description || '').slice(0, 200);
      const body = String(args.body || '');
      const trigger = Array.isArray(args.trigger) ? args.trigger.map(String) : [];

      if (!name || !body) {
        return { success: false, output: '', error: 'name and body are required.' };
      }

      const frontmatter = [
        '---',
        `name: ${name}`,
        `description: ${description}`,
        `trigger: [${trigger.join(', ')}]`,
        '---',
        '',
        body,
      ].join('\n');

      const destPath = join(getConfigDir(), 'skills', `${name}.md`);
      writeFileSync(destPath, frontmatter, 'utf8');

      skillManager.reload();
      onChange?.();

      return {
        success: true,
        output: `Created skill "${name}" at ${destPath}\nTrigger keywords: ${trigger.join(', ') || '(none)'}\nReload skills to activate: /skills`,
      };
    },
  };
}
