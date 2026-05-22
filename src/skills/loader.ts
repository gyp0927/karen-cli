import { Skill } from './types.js';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

export class SkillLoader {
  private skills: Map<string, Skill> = new Map();

  loadFromDirectory(dir: string): Skill[] {
    if (!existsSync(dir)) return [];

    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
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
    try {
      const content = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content) as Skill;
      if (parsed.name && parsed.description && Array.isArray(parsed.trigger) && parsed.prompt) {
        this.skills.set(parsed.name, parsed);
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  getAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  findByTrigger(input: string): Skill[] {
    const lowerInput = input.toLowerCase();
    return this.getAll().filter(skill =>
      skill.trigger.some(t => lowerInput.includes(t.toLowerCase()))
    );
  }

  getByName(name: string): Skill | null {
    return this.skills.get(name) || null;
  }

  clear(): void {
    this.skills.clear();
  }
}
