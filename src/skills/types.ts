export interface Skill {
  name: string;
  description: string;
  trigger: string[];
  /** Pre-computed lowercase triggers for case-insensitive matching */
  _lowerTriggers?: string[];
  prompt: string;
  version?: string;
  author?: string;
  tags?: string[];
}
