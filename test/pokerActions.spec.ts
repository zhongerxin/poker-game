import { describe, expect, it } from 'vitest';
import { buildActionPrompt, clampRaise, getBettingContext, getContextKey, getRaiseBounds, unwrapToolMetadata, type BettingContext, type PokerAction } from '../src/react-app/lib/pokerActions';

const meta = { game_id: 'table-1', hand_id: 'hand-1', stage: 'afterflop', hero_stack: 180, ai_stack: 180 };
const context: BettingContext = { gameId: 'table-1', handId: 'hand-1', stage: 'afterflop' };

describe('widget betting context', () => {
  it.each(['preflop', 'afterflop', 'turn', 'river'])('allows actions during %s', stage => {
    expect(getBettingContext({ ...meta, stage })).toEqual({ ...context, stage });
  });

  it.each([undefined, {}, { ...meta, hand_id: undefined }, { ...meta, stage: 'showdown' }])('does not offer actions without an active, identified hand: %j', value => {
    expect(getBettingContext(value)).toBeNull();
  });

  it.each([meta, { _meta: meta }, { mcp_tool_result: { _meta: meta } }, { call_tool_result: { _meta: meta } }])('reads cards and context from bridge metadata: %j', value => {
    expect(unwrapToolMetadata(value)).toEqual(meta);
  });

  it('unlocks a new hand or street without treating a rerender as another turn', () => {
    expect(getContextKey(context)).toBe(getContextKey({ ...context }));
    expect(getContextKey(context)).not.toBe(getContextKey({ ...context, handId: 'hand-2' }));
    expect(getContextKey(context)).not.toBe(getContextKey({ ...context, stage: 'turn' }));
  });
});

describe('custom raise amounts', () => {
  it('includes posted blinds in preflop raise-to limits', () => {
    expect(getRaiseBounds({ ...meta, stage: 'preflop', bb: 10, sb: 5, button: 'hero', hero_stack: 195, ai_stack: 190 }))
      .toEqual({ min: 20, max: 200, bigBlind: 10 });
    expect(getRaiseBounds({ ...meta, stage: 'preflop', bb: 10, sb: 5, button: 'ai', hero_stack: 190, ai_stack: 95 }))
      .toEqual({ min: 20, max: 100, bigBlind: 10 });
  });

  it('caps postflop amounts at the smaller remaining stack', () => {
    expect(getRaiseBounds({ ...meta, bb: 10, hero_stack: 160, ai_stack: 95 }))
      .toEqual({ min: 10, max: 95, bigBlind: 10 });
  });

  it('permits the only available short-stack all-in amount', () => {
    expect(getRaiseBounds({ ...meta, bb: 10, hero_stack: 6 }))
      .toEqual({ min: 6, max: 6, bigBlind: 10 });
  });

  it.each([{ ...meta }, { ...meta, bb: 10, hero_stack: 0 }, { ...meta, bb: 10, ai_stack: -1 }])('disables the slider when limits are unavailable: %j', value => {
    expect(getRaiseBounds(value)).toBeNull();
  });

  it('clamps presets and rounds to whole chips', () => {
    const bounds = { min: 20, max: 160, bigBlind: 10 };
    expect(clampRaise(7.5, bounds)).toBe(20);
    expect(clampRaise(42.5, bounds)).toBe(43);
    expect(clampRaise(200, bounds)).toBe(160);
  });

  it('sends the selected total and asks again instead of silently changing an illegal raise', () => {
    const prompt = buildActionPrompt({ type: 'raise', amount: 57 }, context);
    expect(prompt).toContain('raise to 57 in total this street');
    expect(prompt).toContain('including any blinds already posted');
    expect(prompt).toContain('do not change the amount or action');
  });

  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid custom amount %s', amount => {
    expect(() => buildActionPrompt({ type: 'raise', amount }, context)).toThrow(RangeError);
  });
});

describe('betting messages', () => {
  it.each<PokerAction>(['check-call', 'half-pot', 'pot', 'all-in', 'fold'])('%s scopes the user action without exposing cards or tool instructions', action => {
    const prompt = buildActionPrompt(action, context);
    expect(prompt).toMatch(/^I /);
    expect(prompt).toContain('game_id="table-1", hand_id="hand-1", stage=afterflop');
    expect(prompt).toContain('Apply once, only if this is still the current hand and stage and it is my turn');
    expect(prompt).toContain('latest bets in chat');
    expect(prompt).not.toContain('poker.afterflop');
    expect(prompt).not.toContain('hero_hole');
  });

  it('sends a relative amount without pretending to know current street bets', () => {
    const prompt = buildActionPrompt('half-pot', context);
    expect(prompt).toContain('half-pot raise');
    expect(prompt).toContain('latest bets in chat');
    expect(prompt.length).toBeLessThan(500);
  });

  it('identifies the user as the folding player', () => {
    expect(buildActionPrompt('fold', context)).toMatch(/^I fold\./);
  });
});
