import { Plan, PlanStep, PlanStepRisk, StepEvidence, PlanStatus } from './types.js';

export class PlanManager {
  private currentPlan: Plan | null = null;

  get hasPlan(): boolean {
    return this.currentPlan !== null;
  }

  get plan(): Plan | null {
    return this.currentPlan;
  }

  submit(summary: string, markdown: string, steps: PlanStep[]): Plan {
    // Sanitize steps: ensure id/title/action exist
    const sanitized = steps.map((s, i) => ({
      ...s,
      id: s.id || `step-${i + 1}`,
      title: s.title || `Step ${i + 1}`,
      action: s.action || 'Execute this step',
      risk: this.sanitizeRisk(s.risk),
      completed: false,
    }));

    this.currentPlan = {
      summary,
      markdown,
      steps: sanitized,
      createdAt: Date.now(),
      approved: false,
    };
    return this.currentPlan;
  }

  approve(): boolean {
    if (!this.currentPlan) return false;
    this.currentPlan.approved = true;
    return true;
  }

  discard(): boolean {
    const had = this.currentPlan !== null;
    this.currentPlan = null;
    return had;
  }

  markComplete(stepId: string, result: string, notes?: string, evidence?: StepEvidence[]): boolean {
    if (!this.currentPlan) return false;
    const step = this.currentPlan.steps.find(s => s.id === stepId);
    if (!step) return false;
    step.completed = true;
    step.result = result;
    if (notes) step.notes = notes;
    if (evidence) step.evidence = evidence;
    return true;
  }

  revise(reason: string, remainingSteps: PlanStep[]): boolean {
    if (!this.currentPlan) return false;
    // Preserve completed steps, replace remaining
    const completed = this.currentPlan.steps.filter(s => s.completed);
    const sanitized = remainingSteps.map((s, i) => ({
      ...s,
      id: s.id || `step-${completed.length + i + 1}`,
      title: s.title || `Step ${completed.length + i + 1}`,
      action: s.action || 'Execute this step',
      risk: this.sanitizeRisk(s.risk),
      completed: false,
    }));
    this.currentPlan.steps = [...completed, ...sanitized];
    this.currentPlan.markdown += `\n\n--- Revision ---\nReason: ${reason}`;
    return true;
  }

  getStatus(): PlanStatus {
    if (!this.currentPlan) {
      return { hasPlan: false, approved: false, totalSteps: 0, completedSteps: 0 };
    }
    const completedSteps = this.currentPlan.steps.filter(s => s.completed).length;
    const currentStep = this.currentPlan.steps.find(s => !s.completed);
    return {
      hasPlan: true,
      approved: this.currentPlan.approved,
      totalSteps: this.currentPlan.steps.length,
      completedSteps,
      currentStep,
      summary: this.currentPlan.summary,
    };
  }

  toMarkdown(): string {
    if (!this.currentPlan) return 'No active plan.';
    const p = this.currentPlan;
    let md = `# Plan: ${p.summary}\n\n${p.markdown}\n\n## Steps\n\n`;
    for (const s of p.steps) {
      const status = s.completed ? '[x]' : '[ ]';
      md += `${status} **${s.id}**: ${s.title}\n`;
      md += `   Action: ${s.action}\n`;
      if (s.risk) md += `   Risk: ${s.risk}\n`;
      if (s.acceptance) md += `   Acceptance: ${s.acceptance}\n`;
      if (s.verification) md += `   Verification: ${s.verification}\n`;
      if (s.targets && s.targets.length > 0) md += `   Targets: ${s.targets.join(', ')}\n`;
      if (s.completed && s.result) md += `   Result: ${s.result}\n`;
      if (s.notes) md += `   Notes: ${s.notes}\n`;
      if (s.evidence && s.evidence.length > 0) {
        md += `   Evidence: ${s.evidence.map(e => `${e.kind}: ${e.summary}`).join('; ')}\n`;
      }
      md += '\n';
    }
    md += `\n---\nStatus: ${p.approved ? 'APPROVED' : 'PENDING APPROVAL'} | ${p.steps.filter(s => s.completed).length}/${p.steps.length} completed\n`;
    return md;
  }

  private sanitizeRisk(risk?: string): PlanStepRisk | undefined {
    if (risk === 'low' || risk === 'med' || risk === 'high') return risk;
    return undefined;
  }
}
