/**
 * Skill half of the MotionWorks IEC bundle: the guidance an agent reads before
 * it touches an IDE.
 *
 * The tools live in `index.js`, which also owns the COM bridge, so a profile can
 * load the guidance without the `mw_*` tools, or the tools without the guidance,
 * by enabling one loader entry or the other. Anything written in `description`
 * and `whenToUse` reaches an agent that never opens the skill, so the workspace
 * rule belongs there as much as it belongs in the body.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE } from './paths.js';

export const name = 'motionworks-iec-use-skill';
export const inject = ['skills'];

export function apply(ctx) {
  // There is nothing to guide on a host without the Windows-only IDE, so the
  // guidance is not registered there either. The tools carry the same gate.
  if (process.platform !== 'win32') {
    try {
      ctx.logger?.info?.(
        'motionworks-iec-use-skill: not loaded. The guidance covers MotionWorks IEC 3 Pro, which '
        + `is a Windows application, and this host is ${process.platform}.`,
      );
    } catch { /* a logger that refuses must not turn an unsupported host into a crash */ }
    return;
  }

  const skills = ctx.get?.('skills');
  if (!skills?.register) throw Error('MotionWorks skill plugin requires the Arya skill service');

  const skillPath = join(HERE, 'SKILL.md');
  const raw = readFileSync(skillPath, 'utf8');
  // Drop the YAML frontmatter: those fields go through the registration instead,
  // so leaving them in `content` would show the agent a second copy of its own
  // description.
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

  // CALLED DIRECTLY, not inside ctx.effect(). The contract is "register a
  // borrowed readonly runtime skill into the calling context's layer ...
  // synchronously during plugin apply", and "fiber disposal unregisters the
  // provider" - so the host already owns teardown.
  skills.register({
    name: 'motionworks-iec-use',
    description: 'Operate a running Yaskawa MotionWorks IEC 3 Pro IDE and edit its code — stage '
      + 'and open a project, read the live object model, read and rewrite POU Structured Text, '
      + 'add variable declarations, compile, and read the compiler verdict and error text. '
      + 'START HERE: run mw_project_find before anything else, and work only on a project inside '
      + 'the workspace — never one from elsewhere on the machine, even if you know where it is. '
      + 'Another program may be read with reference: true; that does not stage or open it. '
      + 'Prefer native mw_ide_variable_change and mw_ide_code_change: patch long ST/IL bodies using a saved hash and exact replacement snippets. Preserve unsaved changes. '
      + 'Use the companion computer-use MCP for operations without a supported native API; verify focus and resulting state before more input. '
      + 'For motion design/diagnosis, use the engineering guide and complete the authorized read-back, fresh compile, approved reopen/recompile and evidence handoff loop.',
    whenToUse: 'The user has MotionWorks IEC 3 Pro open or asks for work in it — a real build, a '
      + 'compile verdict, the live project model, reading or changing POU Structured Text, or '
      + 'the IDE error list. ALSO USE WHEN a MotionWorks project is mentioned at all, even to '
      + 'ask a question about it, because the first step is always to find which project is '
      + 'actually in the workspace.',
    content: body,
    // `custom` plus an absolute `path` is what makes the model-visibility switch
    // available: the manager rewrites `disable-model-invocation` inside the file
    // it is handed, so it only offers a switch for a skill file it can reach
    // outside node_modules.
    path: skillPath,
    source: 'custom',
    provider: 'dsh-motionworks-iec-use',
    invocation: { modelInvocable: true, userInvocable: true },
  });
}
