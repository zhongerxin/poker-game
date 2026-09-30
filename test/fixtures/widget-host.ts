import type { API, OpenAiGlobals, UnknownObject } from '../../src/react-app/types/openai';

// Only a Vite development fixture; never imported by the production entry.
if (!import.meta.env.DEV) throw new Error('The widget host is for local development only');
const params = new URLSearchParams(location.search);
document.body.classList.toggle('preview-only', !params.has('debug'));
const scenario = document.querySelector<HTMLSelectElement>('#scenario')!;
scenario.value = params.get('scenario') ?? 'afterflop';
let hand = 1;
let failNext = false;
let failPersist = false;
const messages: string[] = [];

function update(globals: Partial<OpenAiGlobals>) {
  Object.assign(window.openai, globals);
  window.dispatchEvent(new CustomEvent('openai:set_globals', { detail: { globals } }));
}

const sendFollowUpMessage: API['sendFollowUpMessage'] = async ({ prompt }) => {
  await new Promise(resolve => setTimeout(resolve, 200));
  if (failNext) {
    failNext = false;
    throw new Error('Simulated send failure');
  }
  messages.push(prompt);
  document.querySelector('#sent-messages')!.textContent = messages.map((message, i) => `${i + 1}. ${message}`).join('\n\n');
};

window.openai = {
  displayMode: 'inline', locale: 'zh-CN', widgetState: null, toolOutput: null,
  toolResponseMetadata: null, sendFollowUpMessage,
  setWidgetState: state => {
    if (failPersist) { failPersist = false; throw new Error('Simulated persistence failure'); }
    update({ widgetState: state });
  },
  requestDisplayMode: async ({ mode }) => { update({ displayMode: mode }); return { mode }; },
} as API & OpenAiGlobals;

function loadScenario() {
  const selected = scenario.value;
  const stage = ['preflop', 'afterflop', 'turn', 'river', 'showdown'].includes(selected) ? selected : 'afterflop';
  const board = ['♠A', '♥K', '♣7', '♦2', '♥J'].slice(0, stage === 'preflop' ? 0 : stage === 'afterflop' ? 3 : stage === 'turn' ? 4 : 5);
  const meta: UnknownObject = {
    game_id: 'local-demo', hand_id: `demo-hand-${hand}`, stage,
    bb: 10, sb: 5, button: 'hero',
    pot: stage === 'preflop' ? 15 : 80,
    hero_stack: selected === 'all-in' ? 0 : selected === 'short-stack' ? 6 : stage === 'preflop' ? 195 : 160,
    ai_stack: selected === 'opponent-all-in' ? 0 : stage === 'preflop' ? 190 : 160,
    hero_hole: ['♠Q', '♥Q'], board,
    ...(stage === 'showdown' ? { ai_hole: ['♦A', '♣K'] } : {}),
  };
  if (selected === 'legacy') { delete meta.hand_id; delete meta.stage; }
  window.openai.sendFollowUpMessage = selected === 'unsupported' ? undefined as unknown as API['sendFollowUpMessage'] : sendFollowUpMessage;
  update({
    toolResponseMetadata: selected === 'envelope' ? { status: 'success', mcp_tool_result: { _meta: meta } } : meta,
    toolOutput: { game_id: meta.game_id, hand_id: meta.hand_id, stage },
    locale: selected === 'english' ? 'en-US' : 'zh-CN',
  });
}

scenario.addEventListener('change', loadScenario);
document.querySelector('#new-hand')!.addEventListener('click', () => { hand++; loadScenario(); });
document.querySelector('#fail-next')!.addEventListener('click', () => { failNext = true; });
document.querySelector('#fail-persist')!.addEventListener('click', () => { failPersist = true; });
loadScenario();
const url = new URL(location.href);
url.searchParams.set('widget', 'table');
history.replaceState(null, '', url);
await import('../../src/react-app/App');
