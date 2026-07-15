import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const EXPECTED_ACTION = 'customer_booking';
const FUNCTION_VERSION = '2.6.6';

class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'request_failed') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function configuredList(name: string): string[] {
  return String(Deno.env.get(name) || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function configuredOrigins(): string[] {
  return configuredList('BOOKING_ALLOWED_ORIGINS')
    .map((value) => value.replace(/\/+$/, ''));
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigins = configuredOrigins();
  const allowedOrigin = allowedOrigins.length === 0
    ? '*'
    : (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]);
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Bubblyfi-Function-Version': FUNCTION_VERSION,
    },
  });
}

function requestIp(req: Request): string | undefined {
  return req.headers.get('CF-Connecting-IP')
    || req.headers.get('X-Real-IP')
    || req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || undefined;
}

async function verifyTurnstile(req: Request, token: string): Promise<Record<string, unknown>> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) throw new HttpError(503, 'Customer booking CAPTCHA is not configured on the server.', 'captcha_not_configured');
  if (!token || typeof token !== 'string') throw new HttpError(400, 'Please complete the human verification.', 'captcha_missing');
  if (token.length > 2048) throw new HttpError(400, 'The human-verification response is invalid.', 'captcha_invalid');

  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  const ip = requestIp(req);
  if (ip) body.set('remoteip', ip);
  body.set('idempotency_key', crypto.randomUUID());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body, signal: controller.signal });
  } catch (error) {
    console.error('Turnstile request failed', error);
    throw new HttpError(503, 'Human verification is temporarily unavailable. Please try again.', 'captcha_unavailable');
  } finally {
    clearTimeout(timeout);
  }

  const result = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !result) throw new HttpError(503, 'Human verification is temporarily unavailable. Please try again.', 'captcha_unavailable');
  if (result.success !== true) {
    console.warn('Turnstile rejected booking', { errors: result['error-codes'], ip });
    throw new HttpError(400, 'Human verification failed or expired. Please complete it again.', 'captcha_failed');
  }
  const usingCloudflareTestSecret = /^([123])x0{20,}/.test(secret);
  const actionMatches = result.action === EXPECTED_ACTION || (usingCloudflareTestSecret && result.action === 'test');
  if (!actionMatches) {
    console.warn('Turnstile action mismatch', { expected: EXPECTED_ACTION, received: result.action });
    throw new HttpError(400, 'Human verification did not match this booking form.', 'captcha_action_mismatch');
  }

  const expectedHostnames = configuredList('TURNSTILE_EXPECTED_HOSTNAMES');
  const hostname = String(result.hostname || '');
  if (expectedHostnames.length && !expectedHostnames.includes(hostname)) {
    console.warn('Turnstile hostname mismatch', { expectedHostnames, hostname });
    throw new HttpError(403, 'This booking form is not authorized for the current website.', 'captcha_hostname_mismatch');
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method === 'GET') return json(req, { ok: true, service: 'submit-customer-order', version: FUNCTION_VERSION }, 200);
  if (req.method !== 'POST') return json(req, { ok: false, version: FUNCTION_VERSION, error: 'Method not allowed.' }, 405);

  const allowedOrigins = configuredOrigins();
  const origin = req.headers.get('Origin') || '';
  if (allowedOrigins.length && !allowedOrigins.includes(origin)) {
    return json(req, { ok: false, version: FUNCTION_VERSION, error: 'This website is not allowed to submit customer bookings.' }, 403);
  }

  try {
    const body = await req.json().catch(() => null) as { payload?: Record<string, unknown>; turnstile_token?: string } | null;
    if (!body?.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      throw new HttpError(400, 'Booking details are missing or invalid.', 'invalid_payload');
    }

    await verifyTurnstile(req, String(body.turnstile_token || ''));

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new HttpError(503, 'Booking service configuration is incomplete.', 'server_not_configured');

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc('submit_customer_order', { p_payload: body.payload });
    if (error) {
      console.error('submit_customer_order failed', { code: error.code, message: error.message, details: error.details });
      const safeMessage = /Invalid Philippine mobile/i.test(error.message || '')
        ? error.message
        : /required/i.test(error.message || '')
          ? error.message
          : 'The booking could not be saved. Please review the details and try again.';
      throw new HttpError(400, safeMessage, error.code || 'booking_save_failed');
    }

    let booking: Record<string, unknown> | null = null;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      booking = data as Record<string, unknown>;
    } else if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) booking = parsed;
      } catch (_) {
        // The guard below converts an unexpected RPC result into a structured server error.
      }
    }
    if (!booking || typeof booking.request_no !== 'string' || !booking.request_no) {
      console.error('submit_customer_order returned an invalid payload', { data });
      throw new HttpError(500, 'The booking database returned an invalid result. Redeploy the current database function and retry.', 'invalid_booking_result');
    }

    return json(req, { ok: true, version: FUNCTION_VERSION, booking }, 200);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const code = error instanceof HttpError ? error.code : 'internal_error';
    const message = error instanceof Error ? error.message : 'Unexpected booking error.';
    if (status >= 500) console.error('Verified booking endpoint failed', error);
    return json(req, { ok: false, version: FUNCTION_VERSION, error: message, code }, status);
  }
});
