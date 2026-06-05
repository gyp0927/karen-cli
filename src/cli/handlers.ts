import { AgentLoop } from '../core/loop.js';
import { SkillManager } from '../skills/manager.js';
import { MemoryManager } from '../memory/manager.js';
import { PlanManager } from '../plan/manager.js';
import { ParsedCommand } from './commands.js';
export interface HandlerContext {
  loop: AgentLoop;
  skillManager?: SkillManager;
  memoryManager?: MemoryManager;
  planManager?: PlanManager;
  onSwitchProvider?: (name: string, model?: string) => boolean | Promise<boolean>;
}

export async function handleCommand(
  cmd: ParsedCommand,
  ctx: HandlerContext
): Promise<string[]> {
  const lines: string[] = [];

  switch (cmd.type) {
    case 'help':
      lines.push('Modes (Shift+Tab):');
      lines.push('  💬 Chat — Q&A, no edits  |  🔧 Code — full access');
      lines.push('  🤖 Agent — autonomous    |  📋 Plan — approve first');
      lines.push('');
      lines.push('Commands:');
      lines.push('  /exit                Quit');
      lines.push('  /model [name]         Show or switch provider');
      lines.push('  /cost                 Session cost & tokens');
      lines.push('  /tools                List tools');
      lines.push('  /skills               List skills');
      lines.push('  /skill install <url>  Install skill');
      lines.push('  /skill remove <name>  Remove skill');
      lines.push('  /tasks                Task status');
      lines.push('  /remember <text>      Save memory');
      lines.push('  /forget <keyword>     Delete memory');
      lines.push('  /memory               Memory stats');
      lines.push('  /plan [approve|discard] Plan status');
      lines.push('  /diff                 Show last edit diff');
      lines.push('  /resume [full]        Session summary');
      lines.push('  /rollback [N]         Git rollback');
      lines.push('  /help                 This help');
      break;

    case 'model': {
      if (cmd.args) {
        const parts = cmd.args.split(/\s+/);
        const name = parts[0].toLowerCase().trim();
        const model = parts.slice(1).join(' ') || undefined;
        if (ctx.onSwitchProvider) {
          const ok = await ctx.onSwitchProvider(name, model);
          if (ok) {
            const info = ctx.loop.getProviderInfo();
            lines.push(`Switched to ${info.name} (${info.model})`);
          } else {
            lines.push(`Failed to switch. Supported: anthropic, openai, deepseek, siliconflow`);
          }
        } else {
          lines.push('Provider switching not available.');
        }
      } else {
        const info = ctx.loop.getProviderInfo();
        lines.push(`Provider: ${info.name}  |  Model: ${info.model}`);
      }
      break;
    }

    case 'cost': {
      const ct = ctx.loop.getCostTracker();
      lines.push(ct ? ct.summary() : 'Cost tracking not enabled.');
      break;
    }

    case 'tools': {
      const tools = ctx.loop.getTools();
      if (tools.length === 0) {
        lines.push('No tools registered.');
      } else {
        lines.push(`Available tools (${tools.length}):`);
        for (const t of tools) lines.push(`  • ${t.name}: ${t.description}`);
      }
      break;
    }

    case 'skills': {
      const skills = ctx.loop.getSkills();
      if (skills.length === 0) {
        lines.push('No skills loaded. Place .json/.md files in ~/.karen/skills/');
      } else {
        lines.push(`Loaded skills (${skills.length}):`);
        for (const s of skills) lines.push(`  • ${s.name}: ${s.description} [${s.trigger.join(', ')}]`);
      }
      break;
    }

    case 'skill_install': {
      if (!cmd.args) { lines.push('Usage: /skill install <url>'); break; }
      if (!ctx.skillManager) { lines.push('Skill manager not available.'); break; }
      // Reject file:// URLs and non-HTTP(S) schemes to prevent local file reads / SSRF
      const normalized = cmd.args.trim().toLowerCase();
      if (normalized.startsWith('file://')) {
        lines.push('file:// URLs are not allowed for skill installation.');
        break;
      }
      if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        lines.push('Only HTTP and HTTPS URLs are supported for skill installation.');
        break;
      }
      const skill = await ctx.skillManager.installFromUrl(cmd.args.trim());
      if (skill) {
        lines.push(`Installed: ${skill.name} — ${skill.description}`);
        ctx.loop.setSkills(ctx.skillManager.getSkills());
      } else {
        lines.push('Failed to install. Check URL and file format.');
      }
      break;
    }

    case 'skill_remove': {
      if (!cmd.args) { lines.push('Usage: /skill remove <name>'); break; }
      if (!ctx.skillManager) { lines.push('Skill manager not available.'); break; }
      const ok = ctx.skillManager.remove(cmd.args);
      if (ok) {
        lines.push(`Removed: ${cmd.args}`);
        ctx.loop.setSkills(ctx.skillManager.getSkills());
      } else {
        lines.push(`Skill "${cmd.args}" not found.`);
      }
      break;
    }

    case 'tasks': {
      const tm = ctx.loop.getTaskManager();
      if (!tm) { lines.push('Task manager not available.'); break; }
      const s = tm.getSummary();
      if (s.total === 0) { lines.push('No tasks yet.'); break; }
      lines.push(`Tasks: ${s.total} total | ${s.pending} pending | ${s.running} running | ${s.completed} done | ${s.failed} failed`);
      for (const t of tm.list()) {
        lines.push(`  [${t.status}] ${t.title}`);
      }
      break;
    }

    case 'remember': {
      if (!cmd.args) { lines.push('Usage: /remember <text>'); break; }
      if (!ctx.memoryManager) { lines.push('Memory not available.'); break; }
      await ctx.memoryManager.save({ type: 'user', content: cmd.args, tags: ['user-note'] });
      lines.push(`Saved: ${cmd.args.slice(0, 60)}...`);
      break;
    }

    case 'forget': {
      if (!cmd.args) { lines.push('Usage: /forget <keyword>'); break; }
      if (!ctx.memoryManager) { lines.push('Memory not available.'); break; }
      const all = await ctx.memoryManager.load({ keywords: [cmd.args] });
      const toDel = all.filter(m => m.type === 'user');
      if (toDel.length === 0) { lines.push(`No matches for "${cmd.args}".`); break; }
      let n = 0;
      for (const m of toDel) { if (await ctx.memoryManager.delete(m.id)) n++; }
      lines.push(`Deleted ${n} memory(s).`);
      break;
    }

    case 'memory': {
      if (!ctx.memoryManager) { lines.push('Memory not available.'); break; }
      const all = await ctx.memoryManager.load({ includeExpired: true });
      const counts: Record<string, number> = {};
      for (const m of all) counts[m.type] = (counts[m.type] || 0) + 1;
      lines.push(`Total: ${all.length} memories`);
      for (const [t, c] of Object.entries(counts)) lines.push(`  ${t}: ${c}`);
      break;
    }

    case 'plan': {
      if (!ctx.planManager) { lines.push('Plan manager not available.'); break; }
      const sub = (cmd.args || '').toLowerCase().trim();
      if (sub === 'approve') {
        lines.push(ctx.planManager.approve() ? 'Plan approved.' : 'No pending plan.');
      } else if (sub === 'discard') {
        lines.push(ctx.planManager.discard() ? 'Plan discarded.' : 'No active plan.');
      } else {
        const s = ctx.planManager.getStatus();
        if (!s.hasPlan) { lines.push('No active plan.'); break; }
        lines.push(...ctx.planManager.toMarkdown().split('\n'));
      }
      break;
    }

    case 'diff': {
      const { getLastEdit } = await import('../tools/edit.js');
      const last = getLastEdit();
      if (!last) { lines.push('No edits yet.'); break; }
      lines.push(`Last edit: ${last.filePath}`);
      const orig = last.original.split('\n');
      const mod = last.modified.split('\n');
      for (let i = 0; i < Math.max(orig.length, mod.length); i++) {
        const o = orig[i], m = mod[i];
        if (o === m) lines.push(`  ${o || ''}`);
        else {
          if (o !== undefined) lines.push(`\x1b[31m- ${o}\x1b[0m`);
          if (m !== undefined) lines.push(`\x1b[32m+ ${m}\x1b[0m`);
        }
      }
      break;
    }

    case 'resume': {
      const history = await ctx.loop.loadSession();
      if (history.length === 0) {
        lines.push('No previous session found.');
      } else {
        lines.push(`Session: ${history.length} messages saved.`);
        lines.push(`Use /resume full in a new session to restore context.`);
        const lastMsgs = history.slice(-3);
        for (const m of lastMsgs) {
          lines.push(`  [${m.role}] ${m.content.slice(0, 100)}`);
        }
      }
      break;
    }

    case 'rollback': {
      const { gitRollback } = await import('../core/checkpoint.js');
      const count = cmd.args ? parseInt(cmd.args, 10) || 1 : 1;
      try { lines.push(gitRollback(count)); }
      catch (err) { lines.push(`Rollback failed: ${err instanceof Error ? err.message : String(err)}`); }
      break;
    }

    default:
      lines.push('Unknown command. Type /help for available commands.');
  }

  return lines;
}
