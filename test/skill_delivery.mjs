// Does the plugin actually register its skill, and does the rule ride along in the fields an agent
// sees WITHOUT loading it?
//
// Why this test exists: SKILL.md shipped for the whole life of this plugin and was never registered.
// The cordis patch registered the plugin row and nothing else, and index.js had no reference to the
// file - so a 777-line document, including the workspace rule at line 764, was never once delivered
// to an agent. The owner reported the same failure three times.
//
// A file on disk is not a rule. This asserts the delivery, not the file.
//
// The skill and the tools are separate bundle entries now: `index.js` registers the mw_* tools and
// `skill.js` registers the guidance. This test loads each half on its own, which is what a profile
// does when one entry is disabled in the plugin list.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PLUGIN = process.env.MW_PLUGIN ?? process.argv[2];
if (!PLUGIN) { console.error('set MW_PLUGIN or pass the plugin directory'); process.exit(2); }

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); };

const toolsModule = await import(pathToFileURL(join(PLUGIN, 'index.js')).href);
const skillModule = await import(pathToFileURL(join(PLUGIN, 'skill.js')).href);

// A context shaped like the host's, recording what each half registers.
const recording = () => {
  const registered = { skills: [], tools: [] };
  const ctx = {
    get: (name) => (name === 'skills'
      ? { register: (skill) => { registered.skills.push(skill); return () => {}; } }
      : undefined),
    effect: () => () => {},
    tools: { register: (def) => { registered.tools.push(def); } },
    on: () => {},
    logger: { info: () => {}, warn: (m) => console.log(`    warn: ${m}`) },
  };
  return { registered, ctx };
};

console.log('\n  ══ the skill entry delivers the guidance ══');
const skill = recording();
skillModule.apply(skill.ctx);
check('the skill entry registers a skill', skill.registered.skills.length === 1,
  `${skill.registered.skills.length} registered`);
check('the skill entry registers no tools', skill.registered.tools.length === 0,
  `${skill.registered.tools.length} registered`);

const delivered = skill.registered.skills[0] ?? {};
check('it is named motionworks-iec', delivered.name === 'motionworks-iec', String(delivered.name));
check('the body is loaded from SKILL.md, not empty',
  typeof delivered.content === 'string' && delivered.content.length > 5000,
  `${delivered.content?.length ?? 0} chars`);
check('the frontmatter is stripped from the body',
  !!delivered.content && !delivered.content.startsWith('---'),
  delivered.content?.slice(0, 12).replace(/\n/g, '\\n'));

// The point of the whole exercise: the rule must be in what an agent sees WITHOUT loading.
console.log('\n  ══ the rule rides in the summary, not only the body ══');
const desc = String(delivered.description ?? '');
const when = String(delivered.whenToUse ?? '');
check('the description says to find the project first',
  /mw_project_find/.test(desc), desc.slice(0, 60) + '...');
check('the description says to stay in the workspace',
  /inside the workspace/i.test(desc), '');
check('the description warns against a project elsewhere',
  /never one from elsewhere|elsewhere on the machine/i.test(desc), '');
check('the summary supports native IDE editing, not the old click prohibition',
  /companion computer-use MCP/.test(desc) && !/Do not click MotionWorks/.test(desc), '');
check('the summary prioritizes native code patches and declarations',
  /mw_ide_variable_change/.test(desc) && /mw_ide_code_change/.test(desc) && /saved hash/.test(desc), '');
check('whenToUse fires on merely mentioning a project',
  /mentioned at all/i.test(when), when.slice(0, 60) + '...');
check('it is model-invocable so the agent can load it',
  delivered.invocation?.modelInvocable === true, JSON.stringify(delivered.invocation));
// `custom` plus an absolute SKILL.md path is what makes the Skills page switch available:
// the manager only offers one for a source it may edit and a file outside node_modules.
check('the skill is user-editable so the Skills page can switch it off',
  delivered.source === 'custom' && typeof delivered.path === 'string' && /SKILL\.md$/.test(delivered.path),
  `${String(delivered.source)} ${String(delivered.path)}`);

console.log('\n  ══ the tools entry delivers the tools ══');
const tools = recording();
toolsModule.apply(tools.ctx);
check('the tools entry registers the tools', tools.registered.tools.length >= 38,
  `${tools.registered.tools.length} tools`);
check('the tools entry registers no skill', tools.registered.skills.length === 0,
  `${tools.registered.skills.length} registered`);
check('every tool keeps its schema and render',
  tools.registered.tools.every((t) => t.output?.schema && typeof t.output?.render === 'function'),
  `${tools.registered.tools.filter((t) => t.output?.schema).length} with schema`);

console.log('\n  ══ the halves cannot take each other down ══');
{
  // A profile may run the tools entry alone: there is no skill service to register into.
  const alone = { tools: [] };
  let threw = false;
  try {
    toolsModule.apply({
      get: () => undefined,
      effect: () => () => {},
      tools: { register: (d) => alone.tools.push(d) },
      on: () => {},
      logger: { info: () => {}, warn: () => {} },
    });
  } catch { threw = true; }
  check('the tools entry applies without a skill service', !threw, '');
  check('  and still registers every tool', alone.tools.length >= 38, `${alone.tools.length} tools`);
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? `   ${r.detail}` : ''}`);
console.log(`\n  ${results.length - failed.length} of ${results.length} pass\n`);
process.exit(failed.length ? 1 : 0);
