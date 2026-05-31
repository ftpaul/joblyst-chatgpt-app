// Bearer-token auth via the existing profiles.mcp_api_key column.
//
// Matches the existing supabase/functions/mcp auth model so users can reuse
// the same API key they generated on /account for Claude Desktop / Cursor.
//
// Implementation note: we do NOT use @modelcontextprotocol/sdk's
// requireBearerAuth() express middleware because, in Alpic's deployment
// runtime, requests reaching /mcp don't pass through the express middleware
// layer as expected (verified: middleware never fires, handlers receive
// unauth'd requests with no authInfo). Instead we verify the token inline
// inside profileFromAuth() — guaranteed to run on every tool call.

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { findProfileByApiKey, type ProfileRow } from "./joblyst.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Thrown when auth fails. Caught by handlers and converted to a tool error
// (isError: true) so the LLM sees a clear message rather than -32603.
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function verifyAccessToken(token: string): Promise<AuthInfo> {
  if (!UUID_RE.test(token)) {
    throw new AuthError("API key must be a UUID");
  }
  const profile = await findProfileByApiKey(token);
  if (!profile) {
    throw new AuthError("API key not recognized");
  }
  return {
    token,
    clientId: profile.id,
    scopes: [],
    extra: { profile },
  };
}

function extractBearerFromHeaders(headers: unknown): string | null {
  if (!headers || typeof headers !== "object") return null;
  const h = headers as Record<string, string | string[] | undefined>;
  // Try a few common conventions, case-insensitive.
  const lower = Object.fromEntries(
    Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]),
  ) as Record<string, string | string[] | undefined>;
  const auth = lower["authorization"];
  const authValue = Array.isArray(auth) ? auth[0] : auth;
  if (authValue) {
    const [type, token] = authValue.split(" ");
    if (type?.toLowerCase() === "bearer" && token) return token;
    // Some clients send the raw token without "Bearer " prefix.
    if (!token && UUID_RE.test(authValue)) return authValue;
  }
  // X-API-Key / X-Api-Key style.
  for (const key of ["x-api-key", "x-auth-token", "x-mcp-api-key"]) {
    const v = lower[key];
    const val = Array.isArray(v) ? v[0] : v;
    if (val) return val;
  }
  return null;
}

function extractTokenFromUrl(url: URL | string | undefined): string | null {
  if (!url) return null;
  try {
    const u = url instanceof URL ? url : new URL(url, "http://x");
    return u.searchParams.get("key");
  } catch {
    return null;
  }
}

// Alpic CloudFront/runtime may rewrite the inbound URL when proxying to our
// Node process, dropping the original query string. The original URL is
// preserved in the x-alpic-forwarded-url header.
function extractForwardedUrl(headers: unknown): string | null {
  if (!headers || typeof headers !== "object") return null;
  const h = headers as Record<string, string | string[] | undefined>;
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === "x-alpic-forwarded-url") {
      return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
    }
  }
  return null;
}

function extractToken(extra: {
  requestInfo?: { headers?: unknown; url?: URL | string };
}): string | null {
  return (
    extractBearerFromHeaders(extra.requestInfo?.headers) ??
    extractTokenFromUrl(extra.requestInfo?.url) ??
    extractTokenFromUrl(
      extractForwardedUrl(extra.requestInfo?.headers) ?? undefined,
    )
  );
}

// Dev-only: when no Authorization header is present (e.g. Skybridge DevTools
// has no OAuth flow), fall back to a profile loaded from DEV_PROFILE_API_KEY
// in .env.local. Production never hits this path because requireBearerAuth
// is always mounted there.
let devProfileCache: ProfileRow | null | undefined;

async function getDevProfile(): Promise<ProfileRow | null> {
  if (devProfileCache !== undefined) return devProfileCache;
  const key = process.env.DEV_PROFILE_API_KEY;
  if (!key) {
    devProfileCache = null;
    return null;
  }
  devProfileCache = (await findProfileByApiKey(key)) ?? null;
  return devProfileCache;
}

export async function profileFromAuth(
  extra:
    | {
        authInfo?: AuthInfo;
        requestInfo?: { headers?: unknown; url?: URL | string };
      }
    | undefined,
): Promise<ProfileRow> {
  const safeExtra = extra ?? {};

  // 1) Already authenticated upstream (e.g. by an express middleware that did
  //    fire — keep this path so the code still works if middleware is mounted).
  const fromAuth = safeExtra.authInfo?.extra?.profile as
    | ProfileRow
    | undefined;
  if (fromAuth) return fromAuth;

  // 2) Verify the token inline. Check Authorization/X-API-Key headers AND
  //    the `?key=` query param (the latter is the v1 workaround for ChatGPT
  //    which doesn't expose a static-token auth option in its connector UI).
  const token = extractToken(safeExtra);
  if (token) {
    const info = await verifyAccessToken(token);
    return info.extra!.profile as ProfileRow;
  }

  // 3) Dev fallback: load the profile from DEV_PROFILE_API_KEY in .env.local
  //    so Skybridge DevTools (which can't send a Bearer token) works locally.
  if (process.env.DEV_PROFILE_API_KEY) {
    const dev = await getDevProfile();
    if (dev) return dev;
    throw new AuthError(
      "DEV_PROFILE_API_KEY is set but no profile matches it. Check the UUID in chatgpt-app/.env.local.",
    );
  }

  throw new AuthError(
    "This requires a free Joblyst account. " +
      "Sign up or sign in at https://joblyst.tech, go to /account → 'LLM Access', " +
      "generate an API key, then update the connector URL to " +
      "https://joblyst-app-442c1dad.alpic.live/mcp?key=<your-key>. " +
      "You can still use search_jobs without an account.",
  );
}
