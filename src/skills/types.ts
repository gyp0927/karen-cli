export interface Skill {
  name: string;
  description: string;
  trigger: string[];
  prompt: string;
  version?: string;
  author?: string;
  tags?: string[];
}
