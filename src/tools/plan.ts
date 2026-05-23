import { Tool, ToolResult } from '../core/types.js';
import { PlanManager } from '../plan/manager.js';
import { PlanStepRisk, StepEvidence } from '../plan/types.js';

export function createPlanTool(planManager: PlanManager): Tool {
  return {
    name: 'Plan',
    description: `Submit, revise, or track a structured execution plan. Use this for complex multi-step tasks (3+ steps, risky changes, or parallel work).\n\nOperations:\n- submit: Create a new plan with steps. Blocks until user approves.\n- approve: Mark the pending plan as approved (called automatically after user says yes).\n- mark_complete: Mark a step as done with result/evidence.\n- revise: Replace remaining steps while preserving completed ones.\n- get_status: Show current plan progress.\n\nStep risk levels:\n- low: safe local changes (1 file, reversible)\n- med: multi-file or structural changes\n- high: prod/API-breaking or hard-to-undo\n\nIMPORTANT: For simple tasks (1-2 steps), do NOT use Plan — just call the tools directly.`,
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['submit', 'approve', 'mark_complete', 'revise', 'discard', 'get_status'],
          description: 'The plan operation to perform.',
        },
        summary: {
          type: 'string',
          description: 'For submit: a one-line summary of the overall plan.',
        },
        markdown: {
          type: 'string',
          description: 'For submit: detailed markdown description of the plan.',
        },
        steps: {
          type: 'array',
          description: 'For submit/revise: array of plan steps.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Step identifier (e.g., "step-1", "read-config").' },
              title: { type: 'string', description: 'Short title.' },
              action: { type: 'string', description: 'What to do in this step.' },
              risk: { type: 'string', enum: ['low', 'med', 'high'], description: 'Risk level.' },
              targets: { type: 'array', items: { type: 'string' }, description: 'Files or resources involved.' },
              acceptance: { type: 'string', description: 'Criterion for step completion.' },
              verification: { type: 'string', description: 'Command or check to verify step.' },
            },
            required: ['id', 'title', 'action'],
          },
        },
        step_id: {
          type: 'string',
          description: 'For mark_complete: which step to mark done.',
        },
        result: {
          type: 'string',
          description: 'For mark_complete: summary of what was accomplished.',
        },
        notes: {
          type: 'string',
          description: 'For mark_complete: optional notes.',
        },
        evidence: {
          type: 'array',
          description: 'For mark_complete: optional evidence items.',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['verification', 'diff', 'checkpoint', 'manual'] },
              summary: { type: 'string' },
            },
            required: ['kind', 'summary'],
          },
        },
        reason: {
          type: 'string',
          description: 'For revise: why the plan is being changed.',
        },
      },
      required: ['operation'],
    },
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const op = String(args.operation || '');

      switch (op) {
        case 'submit': {
          const summary = String(args.summary || '');
          const markdown = String(args.markdown || '');
          const rawSteps = Array.isArray(args.steps) ? args.steps : [];
          if (!summary || rawSteps.length === 0) {
            return { success: false, output: '', error: 'submit requires summary and steps.' };
          }
          const steps = rawSteps.map((s: unknown) => {
            const obj = s as Record<string, unknown>;
            return {
              id: String(obj.id || ''),
              title: String(obj.title || ''),
              action: String(obj.action || ''),
              risk: String(obj.risk || '') as PlanStepRisk,
              targets: Array.isArray(obj.targets) ? obj.targets.map(String) : undefined,
              acceptance: String(obj.acceptance || '') || undefined,
              verification: String(obj.verification || '') || undefined,
            };
          });
          const plan = planManager.submit(summary, markdown, steps);
          return {
            success: true,
            output: `Plan "${plan.summary}" submitted with ${plan.steps.length} step(s).\n\nStatus: PENDING USER APPROVAL.\n\nThe user must approve this plan before execution continues. Present the plan clearly and ask the user to confirm.`,
          };
        }

        case 'approve': {
          const ok = planManager.approve();
          if (!ok) return { success: false, output: '', error: 'No pending plan to approve.' };
          return { success: true, output: 'Plan approved. You may now execute the steps.' };
        }

        case 'mark_complete': {
          const stepId = String(args.step_id || '');
          const result = String(args.result || '');
          const notes = String(args.notes || '') || undefined;
          const rawEvidence = Array.isArray(args.evidence) ? args.evidence : [];
          const evidence = rawEvidence.map((e: unknown) => {
            const obj = e as Record<string, unknown>;
            return {
              kind: String(obj.kind || 'manual') as StepEvidence['kind'],
              summary: String(obj.summary || ''),
            };
          });
          const ok = planManager.markComplete(stepId, result, notes, evidence);
          if (!ok) return { success: false, output: '', error: `Step "${stepId}" not found or no active plan.` };
          const status = planManager.getStatus();
          return {
            success: true,
            output: `Step "${stepId}" marked complete. Progress: ${status.completedSteps}/${status.totalSteps}.`,
          };
        }

        case 'revise': {
          const reason = String(args.reason || '');
          const rawSteps = Array.isArray(args.steps) ? args.steps : [];
          if (!reason || rawSteps.length === 0) {
            return { success: false, output: '', error: 'revise requires reason and remainingSteps.' };
          }
          const steps = rawSteps.map((s: unknown) => {
            const obj = s as Record<string, unknown>;
            return {
              id: String(obj.id || ''),
              title: String(obj.title || ''),
              action: String(obj.action || ''),
              risk: String(obj.risk || '') as PlanStepRisk,
              targets: Array.isArray(obj.targets) ? obj.targets.map(String) : undefined,
              acceptance: String(obj.acceptance || '') || undefined,
              verification: String(obj.verification || '') || undefined,
            };
          });
          const ok = planManager.revise(reason, steps);
          if (!ok) return { success: false, output: '', error: 'No active plan to revise.' };
          return { success: true, output: `Plan revised. Reason: ${reason}` };
        }

        case 'discard': {
          const ok = planManager.discard();
          if (!ok) return { success: false, output: '', error: 'No active plan to discard.' };
          return { success: true, output: 'Active plan discarded.' };
        }

        case 'get_status': {
          const status = planManager.getStatus();
          if (!status.hasPlan) {
            return { success: true, output: 'No active plan.' };
          }
          let out = `Plan: ${status.summary}\nStatus: ${status.approved ? 'APPROVED' : 'PENDING'}\nProgress: ${status.completedSteps}/${status.totalSteps}\n`;
          if (status.currentStep) {
            out += `\nNext step: ${status.currentStep.id} - ${status.currentStep.title}\nAction: ${status.currentStep.action}`;
          }
          return { success: true, output: out };
        }

        default:
          return { success: false, output: '', error: `Unknown operation: ${op}` };
      }
    },
  };
}
