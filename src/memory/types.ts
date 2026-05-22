export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface MemoryInput {
  type: MemoryType;
  content: string;
  tags?: string[];
}

export interface MemoryQuery {
  type?: string;
  tags?: string[];
  keywords?: string[];
}
