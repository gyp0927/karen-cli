import { describe, it } from 'node:test';
import assert from 'node:assert';
import { detectProject, buildProjectHints } from '../../../src/core/project.js';

describe('Project Detection', () => {
  it('detects this project as TypeScript/Node', () => {
    const info = detectProject(process.cwd());
    assert.ok(info, 'Should detect a project in karen-cli directory');
    assert.ok(info!.language.includes('TypeScript') || info!.language.includes('JavaScript'));
  });

  it('buildProjectHints returns non-empty for detected project', () => {
    const hints = buildProjectHints(process.cwd());
    assert.ok(hints.length > 0);
    assert.ok(hints.includes('Language'));
  });

  it('returns null for non-project directory', () => {
    const info = detectProject('/tmp');
    assert.strictEqual(info, null);
  });

  it('buildProjectHints returns empty for non-project', () => {
    const hints = buildProjectHints('/tmp');
    assert.strictEqual(hints, '');
  });
});
