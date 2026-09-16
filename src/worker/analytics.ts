export interface AnalyticsEnv {
  GA4_MEASUREMENT_ID?: string;
  GA4_API_SECRET?: string;
  GA4_ENABLED?: string;
  POSTHOG_ENABLED?: string;
  POSTHOG_PROJECT_TOKEN?: string;
  POSTHOG_HOST?: string;
  POKER_IDLE_TIMEOUT_MINUTES?: string;
}

export interface AnalyticsIdentity {
  clientId: string;
  identitySource: 'openai_subject' | 'table_fallback';
  sessionId: number;
}

export interface AnalyticsEvent {
  name: string;
  params: Record<string, string | number>;
}

export interface AnalyticsDelivery {
  client_id: string;
  user_id?: string;
  timestamp_micros: number;
  events: AnalyticsEvent[];
}

// AbortSignal.timeout() leaves its timer alive after a successful request.
// In a Durable Object that extends the invocation lifetime until the deadline.
// Keep the deadline through response-body consumption, then always clear it.
async function withDeliveryTimeout<T>(send: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException('Analytics delivery timed out', 'TimeoutError')), 5000);
  try {
    return await send(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

export async function identifyPlayer(meta: Record<string, unknown> | undefined, tableId: string): Promise<AnalyticsIdentity> {
  const subject = meta?.['openai/subject'];
  const known = typeof subject === 'string' && subject.length > 0;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`poker-game:${known ? subject : tableId}`));
  const hex = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  // Web Measurement Protocol requires <number>.<number>. Keep 96 bits of the
  // digest for deterministic, pseudonymous identity across tables.
  return {
    clientId: `${parseInt(hex.slice(0, 12), 16)}.${parseInt(hex.slice(12, 24), 16)}`,
    identitySource: known ? 'openai_subject' : 'table_fallback',
    sessionId: Math.floor(Date.now() / 1000),
  };
}

export function delivery(identity: AnalyticsIdentity, events: AnalyticsEvent[], now = Date.now()): AnalyticsDelivery {
  return {
    client_id: identity.clientId,
    ...(identity.identitySource === 'openai_subject' ? { user_id: identity.clientId } : {}),
    timestamp_micros: now * 1000,
    events: events.map(event => ({ name: event.name, params: {
      app_name: 'poker-game', identity_source: identity.identitySource,
      session_id: identity.sessionId, ...event.params,
    } })),
  };
}

export async function sendAnalytics(env: AnalyticsEnv, body: AnalyticsDelivery): Promise<void> {
  if (env.GA4_ENABLED !== 'true' || !env.GA4_MEASUREMENT_ID || !env.GA4_API_SECRET) return;
  const url = new URL('https://www.google-analytics.com/mp/collect');
  url.searchParams.set('measurement_id', env.GA4_MEASUREMENT_ID);
  url.searchParams.set('api_secret', env.GA4_API_SECRET);
  await withDeliveryTimeout(async signal => {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal,
    });
    // GA4 has no acknowledgement body. Release the connection even on errors.
    await response.body?.cancel();
    // Never log the request URL: it contains the Measurement Protocol secret.
    if (!response.ok) throw new Error(`GA4 HTTP ${response.status}`);
  });
}

export type AnalyticsProvider = 'ga4' | 'posthog';

export function analyticsProviders(env: AnalyticsEnv): AnalyticsProvider[] {
  return [
    ...(env.GA4_ENABLED === 'true' ? ['ga4' as const] : []),
    ...(env.POSTHOG_ENABLED === 'true' ? ['posthog' as const] : []),
  ];
}

export async function sendPostHog(env: AnalyticsEnv, body: AnalyticsDelivery): Promise<void> {
  if (env.POSTHOG_ENABLED !== 'true') return;
  if (!env.POSTHOG_PROJECT_TOKEN) throw new Error('PostHog configuration missing');
  const host = env.POSTHOG_HOST ?? 'https://us.i.posthog.com';
  // Only allow the configured PostHog Cloud ingestion endpoints to receive the token.
  if (!['https://us.i.posthog.com', 'https://eu.i.posthog.com'].includes(host)) throw new Error('Invalid PostHog host');
  const batch = await Promise.all(body.events.map(async event => {
    // Preserve a valid, deterministic event UUID and timestamp across retries.
    const source = String(event.params.event_id ?? `${body.client_id}:${body.timestamp_micros}:${event.name}`);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)));
    digest[6] = (digest[6] & 0x0f) | 0x50;
    digest[8] = (digest[8] & 0x3f) | 0x80;
    const hex = Array.from(digest.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
    return {
      uuid: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
      event: event.name,
      timestamp: new Date(body.timestamp_micros / 1000).toISOString(),
      properties: {
        ...event.params,
        distinct_id: body.client_id,
        $process_person_profile: event.params.identity_source === 'openai_subject',
        $geoip_disable: true,
        event_source: 'poker_server',
      },
    };
  }));
  await withDeliveryTimeout(async signal => {
    const response = await fetch(`${host}/batch/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: env.POSTHOG_PROJECT_TOKEN, batch }), signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`PostHog HTTP ${response.status}`);
    }
    const result = await response.json() as { status?: number | string };
    if (result.status !== 1 && result.status !== 'Ok') throw new Error('PostHog did not accept batch');
  });
}
