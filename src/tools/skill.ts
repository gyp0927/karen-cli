import { Tool, ToolResult } from '../core/types.js';
import { SkillManager } from '../skills/manager.js';

export function createSkillTool(skillManager: SkillManager, onChange?: () => void): Tool {
  return {
    name: 'Skill',
    description: 'Manage skills: install from a URL, remove by name, or list installed skills. Skills are reusable prompt modules that enhance the AI\'s behavior for specific tasks.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['install', 'remove', 'list'],
          description: 'The operation to perform: install (download from URL), remove (delete by name), or list (show installed skills).',
        },
        url: {
          type: 'string',
          description: 'Required for "install". The URL of the skill file (.md or .json).',
        },
        name: {
          type: 'string',
          description: 'Required for "remove". The name of the skill to remove.',
        },
      },
      required: ['operation'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const operation = String(args.operation);
      const mgr = skillManager;

      if (operation === 'list') {
        const skills = mgr.getSkills();
        if (skills.length === 0) {
          return {
            success: true,
            output: 'No skills installed. Use Skill tool with operation "install" to add skills.',
          };
        }
        const lines = skills.map(s => `- ${s.name}: ${s.description} [triggers: ${s.trigger.join(', ')}]`);
        return {
          success: true,
          output: `Installed skills (${skills.length}):\n${lines.join('\n')}`,
        };
      }

      if (operation === 'install') {
        const url = String(args.url || '');
        if (!url) {
          return {
            success: false,
            output: '',
            error: 'Missing "url" argument for install operation.',
          };
        }

        try {
          const skill = await mgr.installFromUrl(url);
          if (!skill) {
            return {
              success: false,
              output: '',
              error: `Failed to install skill from ${url}. Check the URL and ensure it is a valid skill file (.md or .json).`,
            };
          }
          onChange?.();
          return {
            success: true,
            output: `Installed skill "${skill.name}" (${skill.description}). Triggers: [${skill.trigger.join(', ')}]`,
          };
        } catch (err) {
          return {
            success: false,
            output: '',
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      if (operation === 'remove') {
        const name = String(args.name || '');
        if (!name) {
          return {
            success: false,
            output: '',
            error: 'Missing "name" argument for remove operation.',
          };
        }

        const ok = mgr.remove(name);
        if (ok) {
          onChange?.();
          return {
            success: true,
            output: `Removed skill "${name}".`,
          };
        } else {
          return {
            success: false,
            output: '',
            error: `Skill "${name}" not found.`,
          };
        }
      }

      return {
        success: false,
        output: '',
        error: `Unknown operation "${operation}". Use "install", "remove", or "list".`,
      };
    },
  };
}
