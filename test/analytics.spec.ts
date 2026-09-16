import { describe, it, expect, vi, afterEach } from 'vitest';
import { identifyPlayer, delivery, sendAnalytics, sendPostHog } from '../src/worker/analytics';
import { determineWinner } from '../src/worker/pokerOutcome';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('analytics request lifetime', () => {
  const env = { GA4_ENABLED: 'true', GA4_MEASUREMENT_ID: 'G-TEST', GA4_API_SECRET: 'test',
    POSTHOG_ENABLED: 'true', POSTHOG_PROJECT_TOKEN: 'test' };
  const body = { client_id: '123.456', timestamp_micros: 123000, events: [] };

  it.each(['ga4', 'posthog'])('clears the %s timeout after success and HTTP failure', async provider => {
    vi.useFakeTimers();
    // Node's native AbortSignal.timeout bypasses fake timers. Model its timer
    // so this also catches regressions back to an uncancellable deadline.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    const signals: AbortSignal[] = [];
    let failing = false;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      signals.push(init.signal);
      return failing ? new Response('unavailable', { status: 503 })
        : provider === 'ga4' ? new Response(null, { status: 204 }) : Response.json({ status: 'Ok' });
    }));
    const send = provider === 'ga4' ? sendAnalytics : sendPostHog;
    await send(env, body);
    failing = true;
    await expect(send(env, body)).rejects.toThrow('HTTP 503');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(6000);
    expect(signals.every(signal => !signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a stalled network request and clears its timer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    })));
    const failed = expect(sendAnalytics(env, body)).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await failed;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the deadline active while reading the PostHog acknowledgement', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init.signal.addEventListener('abort', () => controller.error(init.signal.reason), { once: true });
      },
    }))));
    const failed = expect(sendPostHog(env, body)).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await failed;
    expect(vi.getTimerCount()).toBe(0);
  });
});
describe('analytics identity and delivery', () => {
  it('deduplicates the same player across tables without exposing the host subject', async () => {
    const a = await identifyPlayer({ 'openai/subject': 'private-subject' }, 'table-a');
    const b = await identifyPlayer({ 'openai/subject': 'private-subject' }, 'table-b');
    expect(a.clientId).toBe(b.clientId);
    expect(a.clientId).toMatch(/^\d+\.\d+$/);
    expect(a.clientId).not.toContain('private-subject');
    expect(a.identitySource).toBe('openai_subject');
    const anonymous = await identifyPlayer(undefined, 'table-a');
    expect(anonymous.identitySource).toBe('table_fallback');
    expect(delivery(anonymous, []).user_id).toBeUndefined();
  });
  it('does not call GA4 when disabled, and propagates delivery failures for retry', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    const body = delivery(await identifyPlayer(undefined, 'table'), []);
    await sendAnalytics({}, body);
    expect(fetch).not.toHaveBeenCalled();
    await expect(sendAnalytics({ GA4_ENABLED: 'true', GA4_MEASUREMENT_ID: 'G-TEST', GA4_API_SECRET: 'secret' }, body)).rejects.toThrow('GA4 HTTP 503');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty('api_secret');
  });
});

describe('PostHog delivery', () => {
  const env = { POSTHOG_ENABLED: 'true', POSTHOG_PROJECT_TOKEN: 'test-token' };
  it('preserves identity, event IDs and timestamps on retries without reporting server geography', async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json({ status: 'Ok' }));
    vi.stubGlobal('fetch', fetch);
    const identity = await identifyPlayer({ 'openai/subject': 'private-subject' }, 'table');
    const body = delivery(identity, [{ name: 'poker_hand_completed', params: { event_id: 'stable-event', winner: 'hero', hand_id: 'hand' } }]);
    await sendPostHog(env, body);
    await sendPostHog(env, body);
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(fetch.mock.calls[0][0]).toBe('https://us.i.posthog.com/batch/');
    expect(payload).toEqual(JSON.parse(fetch.mock.calls[1][1].body));
    expect(payload.batch[0].uuid).toMatch(/^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(payload.batch[0].timestamp).toBe(new Date(body.timestamp_micros / 1000).toISOString());
    expect(payload.batch[0].properties).toMatchObject({ distinct_id: identity.clientId, winner: 'hero', $geoip_disable: true, $process_person_profile: true });
    expect(JSON.stringify(payload)).not.toContain('private-subject');
  });
  it('does not create player profiles for fallback tables and rejects unsuccessful acknowledgements', async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json({ status: 1 }));
    vi.stubGlobal('fetch', fetch);
    const body = delivery(await identifyPlayer(undefined, 'table'), [{ name: 'poker_activity', params: {} }]);
    await sendPostHog({}, body);
    expect(fetch).not.toHaveBeenCalled();
    await expect(sendPostHog({ POSTHOG_ENABLED: 'true' }, body)).rejects.toThrow('configuration missing');
    await sendPostHog(env, body);
    expect(JSON.parse(fetch.mock.calls[0][1].body).batch[0].properties.$process_person_profile).toBe(false);
    fetch.mockImplementation(async () => Response.json({ status: 0 }));
    await expect(sendPostHog(env, body)).rejects.toThrow('did not accept');
    fetch.mockImplementation(async () => new Response(null, { status: 503 }));
    await expect(sendPostHog(env, body)).rejects.toThrow('PostHog HTTP 503');
  });
});

describe('server-side winner', () => {
  it('recognizes a wheel straight', () => {
    expect(determineWinner(['♠A', '♣2'], ['♠K', '♣K'], ['♦3', '♥4', '♣5', '♦9', '♥T'])).toBe('hero');
  });
  it('handles a shared board tie', () => {
    expect(determineWinner(['♦2', '♦3'], ['♣4', '♣5'], ['♠A', '♠K', '♠Q', '♠J', '♠T'])).toBe('tie');
  });
  it('uses kickers and full houses', () => {
    expect(determineWinner(['♠A', '♣Q'], ['♠K', '♣J'], ['♦7', '♥7', '♣2', '♦3', '♥9'])).toBe('hero');
    expect(determineWinner(['♠A', '♣A'], ['♠K', '♣K'], ['♦K', '♥A', '♣2', '♦2', '♥9'])).toBe('hero');
  });
  it('rejects incomplete and duplicate cards', () => {
    expect(() => determineWinner(['♠A', '♣A'], ['♠K', '♣K'], [])).toThrow();
    expect(() => determineWinner(['♠A', '♣A'], ['♠K', '♣K'], ['♠A', '♥2', '♣3', '♦4', '♥5'])).toThrow();
  });
});
