export type PlanStepRisk = 'low' | 'med' | 'high';

export interface PlanStep {
  id: string;
  title: string;
  action: string;
  risk?: PlanStepRisk;
  targets?: string[];
  acceptance?: string;
  verification?: string;
  completed?: boolean;
  result?: string;
  notes?: string;
  evidence?: StepEvidence[];
}

export interface StepEvidence {
  kind: 'verification' | 'diff' | 'checkpoint' | 'manual';
  summary: string;
}

export interface Plan {
  summary: string;
  markdown: string;
  steps: PlanStep[];
  createdAt: number;
  approved: boolean;
}

export interface PlanStatus {
  hasPlan: boolean;
  approved: boolean;
  totalSteps: number;
  completedSteps: number;
  currentStep?: PlanStep;
  summary?: string;
}
