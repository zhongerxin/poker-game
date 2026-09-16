import { afterEach, describe, expect, it, vi } from 'vitest';
import { PokerDO } from '../src/worker/PokerDO';
import type { GameState } from '../src/worker/index';
import type { AnalyticsEnv } from '../src/worker/analytics';

function setup(overrides: AnalyticsEnv = {}) {
  const records = new Map<string, unknown>();
  let alarmAt: number | null = null;
  const storage = {
    async get(key: string) { return structuredClone(records.get(key)); },
    async put(key: string | Record<string, unknown>, value?: unknown) {
      for (const [k, v] of typeof key === 'string' ? [[key, value]] : Object.entries(key)) records.set(k, structuredClone(v));
    },
    async delete(key: string) { records.delete(key); },
    async list({ prefix }: { prefix: string }) { return new Map([...records].filter(([k]) => k.startsWith(prefix))); },
    async transaction<T>(fn: (txn: unknown) => Promise<T>) { return fn(storage); },
    async setAlarm(at: number) { alarmAt = at; },
    async deleteAlarm() { alarmAt = null; },
  };
  const object = new PokerDO({ storage } as unknown as DurableObjectState, {
    GA4_ENABLED: 'true', GA4_MEASUREMENT_ID: 'G-TEST', GA4_API_SECRET: 'secret', POKER_IDLE_TIMEOUT_MINUTES: '30',
    ...overrides,
  });
  const game: GameState = { id: 'table', deck: [], board: [], hero: {}, ai: {}, stage: 'preflop',
    analytics: { clientId: 'anonymous-user', identitySource: 'openai_subject', sessionId: 123 } };
  const save = (g: GameState) => object.fetch(new Request('https://poker/game', { method: 'POST', body: JSON.stringify(g) }));
  const load = async () => (await object.fetch(new Request('https://poker/game?id=table'))).json() as Promise<GameState>;
  return { object, game, save, load, records, alarm: () => alarmAt };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('durable analytics transitions', () => {
  it('bounds concurrent sends and preserves newly queued events and their alarm', async () => {
    const s = setup();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void;
    const fourStarted = new Promise<void>(resolve => { started = resolve; });
    let active = 0;
    const fetch = vi.fn(async () => {
      if (++active === 4) started();
      await pending;
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetch);
    for (let i = 0; i < 7; i++) s.records.set(`outbox:legacy-${i}`, {
      body: { client_id: '123.456', timestamp_micros: Date.now() * 1000, events: [] },
      attempts: 0, nextAttempt: 0,
    });
    const flushing = s.object.alarm();
    const duplicate = s.object.alarm();
    try {
      await fourStarted;
      expect(fetch).toHaveBeenCalledTimes(4);
      expect([...s.records.keys()].filter(k => k.startsWith('outbox:'))).toHaveLength(7);
      expect((await s.save({ ...s.game, handId: 'hand1' })).status).toBe(204);
      expect((await s.load()).revision).toBe(1);
    } finally {
      release();
      await Promise.all([flushing, duplicate]);
    }
    expect([...s.records.keys()].filter(k => k.startsWith('outbox:'))).toHaveLength(4);
    expect(s.alarm()).toBeGreaterThanOrEqual(Date.now());
    await s.object.alarm();
    expect(fetch).toHaveBeenCalledTimes(8);
    expect([...s.records.keys()].filter(k => k.startsWith('outbox:'))).toHaveLength(0);
    expect(s.alarm()).toBeGreaterThan(Date.now() + 29 * 60_000);
  });

  it('keeps paused and unconfigured providers queued with backoff', async () => {
    vi.useFakeTimers();
    const s = setup({ GA4_ENABLED: 'false', POSTHOG_ENABLED: 'true' });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const body = { client_id: '123.456', timestamp_micros: Date.now() * 1000, events: [] };
    s.records.set('outbox:legacy', { body, attempts: 0, nextAttempt: 0 });
    s.records.set('outbox:posthog:test', { provider: 'posthog', body, attempts: 0, nextAttempt: 0 });
    await s.object.alarm();
    expect(fetch).not.toHaveBeenCalled();
    expect(s.records.get('outbox:legacy')).toMatchObject({ attempts: 1, nextAttempt: Date.now() + 60_000 });
    expect(s.records.get('outbox:posthog:test')).toMatchObject({ attempts: 1, nextAttempt: Date.now() + 60_000 });
    expect(s.alarm()).toBe(Date.now() + 60_000);
  });

  it('retains retries after object recreation with the original event identity', async () => {
    vi.useFakeTimers();
    const s = setup();
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await s.save({ ...s.game, handId: 'hand1' });
    await s.object.alarm();
    const original = JSON.parse(fetch.mock.calls[0][1].body);
    const restored = setup();
    for (const [key, value] of s.records) restored.records.set(key, structuredClone(value));
    vi.setSystemTime(Date.now() + 61_000);
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await restored.object.alarm();
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual(original);
    expect([...restored.records.keys()].some(k => k.startsWith('outbox:'))).toBe(false);
    expect(restored.alarm()).toBeGreaterThan(Date.now());
  });

  it('retries only the failing provider and supports PostHog without GA4', async () => {
    vi.useFakeTimers();
    const s = setup({ POSTHOG_ENABLED: 'true', POSTHOG_PROJECT_TOKEN: 'test-token' });
    let failPostHog = true;
    const fetch = vi.fn(async (url: string | URL) => String(url).includes('posthog')
      ? failPostHog ? new Response(null, { status: 503 }) : Response.json({ status: 'Ok' })
      : new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await s.save({ ...s.game, handId: 'hand1' });
    await s.object.alarm();
    expect([...s.records.keys()].filter(k => k.startsWith('outbox:'))).toHaveLength(1);
    expect([...s.records.keys()].some(k => k.startsWith('outbox:posthog:'))).toBe(true);
    failPostHog = false;
    vi.setSystemTime(Date.now() + 61_000);
    await s.object.alarm();
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('google-analytics'))).toHaveLength(1);
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('posthog'))).toHaveLength(2);
    const only = setup({ GA4_ENABLED: 'false', POSTHOG_ENABLED: 'true', POSTHOG_PROJECT_TOKEN: 'test-token' });
    await only.save(only.game);
    await only.object.alarm();
    expect([...only.records.keys()].filter(k => k.startsWith('outbox:'))).toHaveLength(0);
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('google-analytics'))).toHaveLength(1);
  });
  it('delivers legacy queued records only to GA4', async () => {
    const s = setup({ POSTHOG_ENABLED: 'true', POSTHOG_PROJECT_TOKEN: 'test-token' });
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    s.records.set('outbox:legacy', { body: { client_id: '123.456', timestamp_micros: Date.now() * 1000, events: [] }, attempts: 0, nextAttempt: 0 });
    await s.object.alarm();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain('google-analytics');
    expect(s.records.has('outbox:legacy')).toBe(false);
  });
  it('tracks one start per hand, one chip selection per table, and rejects stale writes', async () => {
    const s = setup();
    const sent: { events: { name: string }[] }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { sent.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }));
    await s.save(s.game);
    const first = { ...await s.load(), handId: 'hand1', handNumber: 1, selectedChipStack: 500 };
    await s.save(first);
    expect((await s.save(first)).status).toBe(409);
    const flop = { ...await s.load(), stage: 'afterflop' as const };
    await s.save(flop);
    await s.save(await s.load()); // No new transition.
    await s.save({ ...await s.load(), stage: 'showdown', winner: 'hero', endReason: 'fold', finalStage: 'afterflop' });
    await s.save({ ...await s.load(), stage: 'preflop', handId: 'hand2', handNumber: 2 });
    await s.object.alarm();
    await s.object.alarm(); // Drain the next bounded batch.
    const names = sent.flatMap(p => p.events.map(e => e.name));
    expect(names.filter(n => n === 'poker_hand_started')).toHaveLength(2);
    expect(names.filter(n => n === 'poker_chips_selected')).toHaveLength(1);
    expect(names.filter(n => n === 'poker_hand_completed')).toHaveLength(1);
    expect(names.filter(n => n === 'poker_stage_reached')).toHaveLength(4);
  });
  it('persists failed deliveries, retries, and records timeout once then resume', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T01:00:00Z'));
    const s = setup();
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await s.save({ ...s.game, handId: 'hand1', handNumber: 1 });
    await s.object.alarm();
    expect([...s.records.keys()].some(k => k.startsWith('outbox:'))).toBe(true);
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    vi.setSystemTime(Date.now() + 31 * 60_000);
    await s.object.alarm();
    await s.object.alarm();
    const events = fetch.mock.calls.flatMap(call => JSON.parse(call[1].body).events);
    const interrupted = events.filter(e => e.name === 'poker_hand_interrupted');
    expect(interrupted).toHaveLength(1);
    expect(interrupted[0].params.disconnect_confirmed).toBe(0);
    expect(interrupted[0].params).not.toHaveProperty('engagement_time_msec');
    await s.save({ ...await s.load(), stage: 'afterflop' });
    await s.object.alarm();
    expect(fetch.mock.calls.flatMap(call => JSON.parse(call[1].body).events).filter(e => e.name === 'poker_hand_resumed')).toHaveLength(1);
    expect(s.alarm()).toBeGreaterThan(Date.now());
  });
  it('never marks completed hands as interrupted', async () => {
    vi.useFakeTimers();
    const s = setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await s.save({ ...s.game, handId: 'hand1', stage: 'showdown' });
    vi.setSystemTime(Date.now() + 31 * 60_000);
    await s.object.alarm();
    expect(s.alarm()).toBeNull();
  });
});
