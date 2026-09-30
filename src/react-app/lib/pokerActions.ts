import type { UnknownObject } from '../types/openai';

export type PokerAction = 'check-call' | 'half-pot' | 'pot' | 'all-in' | 'fold' | { type: 'raise'; amount: number };
export type RaiseBounds = { min: number; max: number; bigBlind: number };
export type BettingContext = {
  gameId: string;
  handId: string;
  stage: 'preflop' | 'afterflop' | 'turn' | 'river';
};

const asObject = (value: unknown): UnknownObject | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownObject : undefined;

// Support both the original bridge and the canonical MCP result envelope.
export function unwrapToolMetadata(value: UnknownObject | null | undefined): UnknownObject | undefined {
  if (!value) return undefined;
  const result = asObject(value.mcp_tool_result) ?? asObject(value.call_tool_result);
  return asObject(result?._meta) ?? asObject(value._meta) ?? value;
}

export function getBettingContext(meta: UnknownObject | undefined): BettingContext | null {
  if (typeof meta?.game_id !== 'string' || !meta.game_id ||
      typeof meta.hand_id !== 'string' || !meta.hand_id) return null;
  const stage = meta.stage;
  if (stage !== 'preflop' && stage !== 'afterflop' && stage !== 'turn' && stage !== 'river') return null;
  return { gameId: meta.game_id, handId: meta.hand_id, stage };
}

export function getContextKey(context: BettingContext): string {
  return JSON.stringify([context.gameId, context.handId, context.stage]);
}

export function getRaiseBounds(meta: UnknownObject | undefined): RaiseBounds | null {
  const bb = Number(meta?.bb);
  const sb = Number(meta?.sb);
  const hero = Number(meta?.hero_stack);
  const ai = Number(meta?.ai_stack);
  if (![bb, hero, ai].every(Number.isFinite) || bb <= 0 || hero <= 0 || ai <= 0) return null;
  const preflop = meta?.stage === 'preflop';
  if (preflop && (!Number.isFinite(sb) || sb <= 0 || (meta?.button !== 'hero' && meta?.button !== 'ai'))) return null;
  // Raise-to includes blinds; stacks are recorded at the start of the street.
  const heroPosted = preflop ? (meta?.button === 'hero' ? sb : bb) : 0;
  const aiPosted = preflop ? (meta?.button === 'ai' ? sb : bb) : 0;
  const max = Math.floor(Math.min(hero + heroPosted, ai + aiPosted));
  if (!Number.isSafeInteger(max) || max < 1) return null;
  return { min: Math.min(Math.ceil(bb * (preflop ? 2 : 1)), max), max, bigBlind: bb };
}

export function clampRaise(amount: number, bounds: RaiseBounds): number {
  return Math.min(bounds.max, Math.max(bounds.min, Number.isFinite(amount) ? Math.ceil(amount) : bounds.min));
}

export function buildActionPrompt(action: PokerAction, context: BettingContext): string {
  const choices: Record<Extract<PokerAction, string>, string> = {
    'check-call': 'I check if nothing is owed; otherwise I call the current bet, up to my remaining stack.',
    'half-pot': 'I bet half the pot, or make a half-pot raise if there is already a bet.',
    pot: 'I bet the pot, or make a pot-sized raise if there is already a bet.',
    'all-in': 'I go all-in with my remaining chips. Return any uncalled excess.',
    fold: 'I fold.',
  };
  if (typeof action !== 'string' && (!Number.isSafeInteger(action.amount) || action.amount <= 0)) {
    throw new RangeError('Raise amount must be a positive whole number');
  }
  const selection = typeof action === 'string' ? choices[action]
    : `I bet / raise to ${action.amount} in total this street, including any blinds already posted this street. If this amount is not legal, ask me to choose again; do not change the amount or action.`;
  return [
    selection,
    `[Poker widget context: game_id=${JSON.stringify(context.gameId)}, hand_id=${JSON.stringify(context.handId)}, stage=${context.stage}]`,
    'Use the latest bets in chat. Apply once, only if this is still the current hand and stage and it is my turn; otherwise show the current state.',
  ].join('\n');
}
