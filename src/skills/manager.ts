import { SkillLoader } from './loader.js';
import { Skill } from './types.js';
import { homedir } from 'os';
import { join, extname } from 'path';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { resilientFetch } from '../utils/http.js';

export class SkillManager {
  private loader: SkillLoader;
  private skillsDir: string;

  constructor(skillsDir?: string) {
    this.loader = new SkillLoader();
    this.skillsDir = skillsDir || join(homedir(), '.karen', 'skills');
    this.ensureDir();
    this.reload();
  }

  private ensureDir(): void {
    if (!existsSync(this.skillsDir)) {
      mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  reload(): Skill[] {
    this.loader.clear();
    this.loader.loadFromDirectory(this.skillsDir);
    return this.loader.getAll();
  }

  getSkills(): Skill[] {
    return this.loader.getAll();
  }

  async installFromUrl(url: string): Promise<Skill | null> {
    try {
      let content: string;
      let urlPath: string;

      // Handle file:// URLs locally (Node.js fetch doesn't support file://)
      if (url.startsWith('file://')) {
        const fs = await import('fs');
        const filePath = url.replace(/^file:\/\/\/?/, '');
        content = fs.readFileSync(filePath, 'utf8');
        urlPath = filePath;
      } else {
        const result = await resilientFetch({ url, timeoutMs: 30_000, maxRetries: 2 });
        if (!result.ok) {
          throw new Error(result.error || `HTTP ${result.status}`);
        }
        content = result.text;
        urlPath = new URL(url).pathname;
      }

      if (!content.trim()) {
        throw new Error('Empty response');
      }

      // Determine file extension from URL or content
      let ext = extname(urlPath).toLowerCase();
      if (ext !== '.md' && ext !== '.json') {
        ext = content.trim().startsWith('---') ? '.md' : '.json';
      }

      // Try to parse to validate and extract name
      const tempLoader = new SkillLoader();
      const tempFile = join(this.skillsDir, `temp-${Date.now()}${ext}`);
      const fs = await import('fs');
      fs.writeFileSync(tempFile, content, 'utf8');

      const skill = tempLoader.loadFromFile(tempFile);
      fs.rmSync(tempFile);

      if (!skill) {
        throw new Error('Invalid skill file format');
      }

      // Save with proper filename
      const fileName = `${skill.name}${ext}`;
      const filePath = join(this.skillsDir, fileName);
      fs.writeFileSync(filePath, content, 'utf8');

      // Reload all skills
      this.reload();
      return skill;
    } catch (err) {
      return null;
    }
  }

  remove(name: string): boolean {
    const skills = this.loader.getAll();
    const skill = skills.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (!skill) return false;

    // Find the file by trying both extensions
    const mdPath = join(this.skillsDir, `${skill.name}.md`);
    const jsonPath = join(this.skillsDir, `${skill.name}.json`);

    let removed = false;
    if (existsSync(mdPath)) {
      rmSync(mdPath);
      removed = true;
    }
    if (existsSync(jsonPath)) {
      rmSync(jsonPath);
      removed = true;
    }

    if (removed) {
      this.reload();
    }
    return removed;
  }
}
