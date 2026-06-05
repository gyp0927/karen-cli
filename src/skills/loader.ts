import { Skill } from './types.js';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, extname } from 'path';

function parseValue(value: string): unknown {
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      return JSON.parse(value);
    } catch {
      // Non-JSON array notation like [debug, fix test] — split manually
      const inner = value.slice(1, -1).trim();
      if (inner.length === 0) return [];
      return inner.split(',').map(s => {
        const t = s.trim();
        // Strip surrounding quotes if present
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
          return t.slice(1, -1);
        }
        return t;
      });
    }
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\s*(?:\r?\n)([\s\S]*?)(?:\r?\n)---\s*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const raw = match[1].trim();
  let frontmatter: Record<string, unknown> = {};

  // Try JSON frontmatter first
  if (raw.startsWith('{')) {
    try {
      frontmatter = JSON.parse(raw);
      return { frontmatter, body: match[2].trim() };
    } catch { /* fall through */ }
  }

  // Simple YAML-like parser supporting inline and block arrays
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    if (trimmed.startsWith('- ')) {
      i++;
      continue; // Orphan array item, skip
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex <= 0) {
      i++;
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();

    // Check if next non-empty lines are array items
    let j = i + 1;
    const arrayItems: string[] = [];
    while (j < lines.length) {
      const nextTrimmed = lines[j].trim();
      if (!nextTrimmed) {
        j++;
        continue;
      }
      if (nextTrimmed.startsWith('- ')) {
        arrayItems.push(nextTrimmed.slice(2).trim());
        j++;
      } else {
        break;
      }
    }

    if (arrayItems.length > 0) {
      frontmatter[key] = arrayItems;
      i = j;
      continue;
    }

    if (value) {
      frontmatter[key] = parseValue(value);
    }

    i++;
  }

  return { frontmatter, body: match[2].trim() };
}

function isValidSkill(obj: Record<string, unknown>): obj is Record<string, unknown> & { name: string; description: string; trigger: string[]; prompt: string } {
  return (
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    Array.isArray(obj.trigger) &&
    obj.trigger.every(t => typeof t === 'string') &&
    typeof obj.prompt === 'string'
  );
}

export class SkillLoader {
  private skills: Map<string, Skill> = new Map();

  loadFromDirectory(dir: string): Skill[] {
    if (!existsSync(dir)) return [];

    const files = readdirSync(dir).filter(f => {
      const ext = extname(f).toLowerCase();
      return ext === '.json' || ext === '.md';
    });

    const loaded: Skill[] = [];

    for (const file of files) {
      const skill = this.loadFromFile(join(dir, file));
      if (skill) {
        this.skills.set(skill.name, skill);
        loaded.push(skill);
      }
    }

    return loaded;
  }

  loadFromFile(filePath: string): Skill | null {
    const ext = extname(filePath).toLowerCase();

    try {
      const content = readFileSync(filePath, 'utf8');

      if (ext === '.md') {
        return this.parseMarkdownSkill(content);
      }

      // JSON
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (isValidSkill(parsed)) {
        const skill: Skill = {
          name: parsed.name,
          description: parsed.description,
          trigger: parsed.trigger,
          _lowerTriggers: parsed.trigger.map((t: string) => t.toLowerCase()),
          prompt: parsed.prompt,
          ...(typeof parsed.version === 'string' ? { version: parsed.version } : {}),
          ...(typeof parsed.author === 'string' ? { author: parsed.author } : {}),
          ...(Array.isArray(parsed.tags) ? { tags: parsed.tags.filter(t => typeof t === 'string') } : {}),
        };
        this.skills.set(skill.name, skill);
        return skill;
      }
      return null;
    } catch {
      return null;
    }
  }

  private parseMarkdownSkill(content: string): Skill | null {
    const { frontmatter, body } = parseFrontmatter(content);

    const name = String(frontmatter.name || '');
    const description = String(frontmatter.description || '');
    const trigger = Array.isArray(frontmatter.trigger)
      ? frontmatter.trigger.map(t => String(t))
      : typeof frontmatter.trigger === 'string'
        ? frontmatter.trigger.split(',').map(s => s.trim())
        : [];
    const prompt = body || String(frontmatter.prompt || '');

    if (!name || !description || trigger.length === 0 || !prompt) {
      return null;
    }

    const skill: Skill = {
      name,
      description,
      trigger,
      _lowerTriggers: trigger.map(t => t.toLowerCase()),
      prompt,
      ...(typeof frontmatter.version === 'string' ? { version: frontmatter.version } : {}),
      ...(typeof frontmatter.author === 'string' ? { author: frontmatter.author } : {}),
      ...(Array.isArray(frontmatter.tags) ? { tags: frontmatter.tags.map(t => String(t)) } : {}),
    };

    this.skills.set(skill.name, skill);
    return skill;
  }

  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  findByTrigger(input: string): Skill[] {
    const lowerInput = input.toLowerCase();
    return this.getAll().filter(skill => {
      const triggers = skill._lowerTriggers || skill.trigger.map(t => t.toLowerCase());
      return triggers.some(t => lowerInput.includes(t));
    });
  }

  getByName(name: string): Skill | null {
    return this.skills.get(name) || null;
  }

  clear(): void {
    this.skills.clear();
  }
}
