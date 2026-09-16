import type { GameState } from "./index";
let pokerNamespace: DurableObjectNamespace | undefined;
export function setPokerNamespace(namespace: DurableObjectNamespace) {
  pokerNamespace = namespace;
}
import { analyticsProviders, delivery, sendAnalytics, sendPostHog, type AnalyticsProvider, type AnalyticsEnv, type AnalyticsEvent, type AnalyticsDelivery } from "./analytics";

//storage
// 为单局牌生成对应 DO 实例的 stub，不做本地缓存，依赖 idFromName 保证同名命中同一实例
function getPokerStub(gameId: string) {
  if (!pokerNamespace) throw new Error("POKER Durable Object is not initialized");
  const pokerStub = pokerNamespace.get(pokerNamespace.idFromName(gameId));
  return pokerStub;
}

export async function loadGame(gameId: string): Promise<GameState | null> {
  // 通过 DO 实例读取持久化的牌局状态，404 表示不存在
  const res = await getPokerStub(gameId).fetch(`https://poker/game?id=${gameId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load game: ${res.statusText}`);

  const game = (await res.json()) as GameState;
  return game;
}

export async function saveGame(game: GameState) {
  // 将牌局状态写入对应的 DO 存储
  const res = await getPokerStub(game.id).fetch("https://poker/game", {
    method: "POST",
    body: JSON.stringify(game),
  });
  if (!res.ok) throw new Error(`Failed to save game: ${res.statusText}`);
}

export async function deleteGame(gameId: string) {
  // 删除 DO 存储中的该局数据，不销毁实例
  await getPokerStub(gameId).fetch(`https://poker/game?id=${gameId}`, { method: "DELETE" });
}

interface Activity {
  gameId: string;
  lastActivity: number;
  timedOut: boolean;
}

interface PendingDelivery {
  // Existing outbox records predate PostHog and are GA4-only.
  provider?: AnalyticsProvider;
  body: AnalyticsDelivery;
  attempts: number;
  nextAttempt: number;
}

// One bounded wave per alarm: an outage cannot turn 100 serial sends into
// minutes of work. Remaining records stay durable and schedule the next alarm.
const DELIVERY_BATCH_SIZE = 4;

export class PokerDO {
  private flushing?: Promise<void>;
  constructor(private state: DurableObjectState, private env: AnalyticsEnv) {}

  private enqueue(writes: Record<string, unknown>, body: AnalyticsDelivery, eventId: string, now: number) {
    for (const provider of analyticsProviders(this.env)) {
      writes[`outbox:${provider}:${eventId}`] = {
        provider, body, attempts: 0, nextAttempt: now,
      } satisfies PendingDelivery;
    }
  }

  private get idleTimeout() {
    const minutes = Number(this.env.POKER_IDLE_TIMEOUT_MINUTES ?? 30);
    return (Number.isFinite(minutes) && minutes > 0 ? minutes : 30) * 60_000;
  }

  private events(previous: GameState | undefined, game: GameState, resumed: boolean): AnalyticsEvent[] {
    const params = {
      table_id: game.id, hand_id: game.handId ?? 'setup', hand_number: game.handNumber ?? 0,
      stage: game.stage === 'afterflop' ? 'flop' : game.stage ?? 'setup',
      chip_stack: game.selectedChipStack ?? 0, starting_stack: game.startingStack ?? 0,
      small_blind: game.sb ?? 0, big_blind: game.bb ?? 0, pot: game.pot ?? 0,
    };
    const events: AnalyticsEvent[] = [];
    const add = (name: string, extra: Record<string, string | number> = {}) => events.push({ name, params: { ...params, ...extra } });
    if (!previous) add('poker_table_created');
    if (resumed) add('poker_hand_resumed');
    if (game.handId && previous?.handId !== game.handId) {
      if (!previous?.handId) add('poker_chips_selected');
      add('poker_hand_started');
      add('poker_stage_reached');
    } else if (game.stage !== previous?.stage && game.handId) {
      add('poker_stage_reached');
    }
    if (game.stage === 'showdown' && previous?.stage !== 'showdown') {
      add('poker_hand_completed', {
        winner: game.winner ?? 'unknown', end_reason: game.endReason ?? 'unknown',
        final_stage: game.finalStage === 'afterflop' ? 'flop' : game.finalStage ?? 'unknown',
      });
    }
    if (events.length) add('poker_activity', { engagement_time_msec: 1 });
    return events;
  }

  async fetch(req: Request) {
    const id = new URL(req.url).searchParams.get('id');
    if (req.method === 'GET') {
      if (!id) return new Response('missing id', { status: 400 });
      const game = await this.state.storage.get<GameState>(id);
      return game ? Response.json(game) : new Response('not found', { status: 404 });
    }
    if (req.method === 'POST') {
      const game = await req.json() as GameState;
      const now = Date.now();
      const accepted = await this.state.storage.transaction(async txn => {
        const previous = await txn.get<GameState>(game.id);
        if ((previous?.revision ?? 0) !== (game.revision ?? 0)) return false;
        const activity = await txn.get<Activity>('activity');
        // Preserve identity for the table; metadata is not authentication.
        if (previous?.analytics?.identitySource === 'openai_subject') game.analytics = previous.analytics;
        if (game.analytics && activity && now - activity.lastActivity >= this.idleTimeout) {
          game.analytics.sessionId = Math.floor(now / 1000);
        }
        const events = this.events(previous, game, activity?.timedOut ?? false);
        game.revision = (previous?.revision ?? 0) + 1;
        const writes: Record<string, unknown> = {
          [game.id]: game,
          activity: { gameId: game.id, lastActivity: now, timedOut: false },
        };
        if (game.analytics && events.length && analyticsProviders(this.env).length) {
          const eventId = crypto.randomUUID();
          this.enqueue(writes, delivery(game.analytics, events.map(e => ({ ...e, params: { ...e.params, event_id: `${eventId}:${e.name}` } })), now), eventId, now);
        }
        await txn.put(writes);
        await txn.setAlarm(now + 1000);
        return true;
      });
      if (!accepted) return new Response('Game changed; retry with current state', { status: 409 });
      return new Response(null, { status: 204 });
    }
    if (req.method === 'DELETE') {
      if (!id) return new Response('missing id', { status: 400 });
      await this.state.storage.delete(id);
      await this.state.storage.delete('activity');
      return new Response(null, { status: 204 });
    }
    return new Response('method not allowed', { status: 405 });
  }

  async alarm() {
    // Alarm work survives isolate eviction. Only one flush per instance.
    if (this.flushing) return this.flushing;
    this.flushing = this.flush().finally(() => { this.flushing = undefined; });
    return this.flushing;
  }

  private async flush() {
    const now = Date.now();
    await this.state.storage.transaction(async txn => {
      const activity = await txn.get<Activity>('activity');
      if (!activity || activity.timedOut || now - activity.lastActivity < this.idleTimeout) return;
      const game = await txn.get<GameState>(activity.gameId);
      if (!game?.handId || game.stage === 'showdown') return;
      activity.timedOut = true;
      const writes: Record<string, unknown> = { activity };
      if (game.analytics && analyticsProviders(this.env).length) {
        const eventId = crypto.randomUUID();
        this.enqueue(writes, delivery(game.analytics, [{ name: 'poker_hand_interrupted', params: {
            event_id: eventId, table_id: game.id, hand_id: game.handId,
            stage: game.stage === 'afterflop' ? 'flop' : game.stage ?? 'preflop',
            reason: 'inactivity_timeout', disconnect_confirmed: 0,
            idle_timeout_minutes: this.idleTimeout / 60_000,
          } }], now), eventId, now);
      }
      await txn.put(writes);
    });
    const pending = await this.state.storage.list<PendingDelivery>({ prefix: 'outbox:' });
    const due = [...pending].filter(([, item]) => item.nextAttempt <= now)
      .sort((a, b) => a[1].nextAttempt - b[1].nextAttempt).slice(0, DELIVERY_BATCH_SIZE);
    const results = await Promise.allSettled(due.map(async ([key, item]) => {
      const provider = item.provider ?? 'ga4';
      try {
        if (!analyticsProviders(this.env).includes(provider)) throw new Error('Analytics provider paused');
        // Preserve unsent events when a secret is missing; don't silently discard them.
        if (provider === 'ga4') {
          if (!this.env.GA4_API_SECRET || !this.env.GA4_MEASUREMENT_ID) throw new Error('GA4 configuration missing');
          await sendAnalytics(this.env, item.body);
        } else {
          await sendPostHog(this.env, item.body);
        }
        await this.state.storage.delete(key);
      } catch {
        item.attempts++;
        if (Date.now() - item.body.timestamp_micros / 1000 > 71 * 60 * 60_000) {
          console.error('analytics_delivery_expired', { provider, eventId: key, attempts: item.attempts });
          await this.state.storage.delete(key);
        } else {
          item.nextAttempt = Date.now() + Math.min(60_000 * 2 ** Math.min(item.attempts - 1, 6), 3_600_000);
          await this.state.storage.put(key, item);
          console.warn('analytics_delivery_retry', { provider, attempts: item.attempts });
        }
      }
    }));
    // Wait for every in-flight write before letting the runtime retry a storage
    // failure. Otherwise an early rejection could overlap another flush.
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
    }
    // Re-read after external I/O so a concurrent hand update cannot lose its alarm.
    await this.state.storage.transaction(async txn => {
      const remaining = await txn.list<PendingDelivery>({ prefix: 'outbox:' });
      const activity = await txn.get<Activity>('activity');
      const game = activity ? await txn.get<GameState>(activity.gameId) : undefined;
      const deadlines = [...remaining.values()].map(item => item.nextAttempt);
      if (activity && game?.handId && game.stage !== 'showdown' && !activity.timedOut) deadlines.push(activity.lastActivity + this.idleTimeout);
      if (deadlines.length) await txn.setAlarm(Math.max(Date.now() + 1000, Math.min(...deadlines)));
      else await txn.deleteAlarm();
    });
  }
}
