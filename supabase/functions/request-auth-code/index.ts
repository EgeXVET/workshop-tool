import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const XVET_DOMAIN = "xvetgermany.com";
const WORKSHOP_PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

export function isXvetEmail(email: string) {
  const domain = String(email || "").trim().toLowerCase().split("@").pop() || "";
  return domain === XVET_DOMAIN || domain.endsWith("." + XVET_DOMAIN);
}

function isAllowedRedirect(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.hostname.endsWith(".supabase.co")) return false;
    const host = url.hostname;
    const path = url.pathname;
    const local = host === "localhost" || host === "127.0.0.1";
    const workshopPage = /xvet_strategy_workshop_tool_v6\.html$/i.test(path);
    const githubPages = host === "egexvet.github.io" &&
      /^\/(workshop-tool|xvet-partner-journey)(\/|\/index\.html)?$/i.test(path);
    return local || workshopPage || githubPages;
  } catch {
    return false;
  }
}

function authHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function adminPost(url: string, key: string, path: string, body: unknown) {
  const res = await fetch(new URL(path, url), {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({} as Record<string, unknown>));
  return { res, payload };
}

function hashedTokenOf(payload: Record<string, unknown>) {
  const props = payload.properties && typeof payload.properties === "object"
    ? payload.properties as Record<string, unknown>
    : null;
  return String(payload.hashed_token || props?.hashed_token || "");
}

function sessionOf(payload: Record<string, unknown>) {
  const nested = payload.session && typeof payload.session === "object"
    ? payload.session as Record<string, unknown>
    : payload;
  const access_token = String(nested.access_token || "");
  const refresh_token = String(nested.refresh_token || "");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const redirectTo = String(body.redirectTo || "").trim();

    if (!email || !email.includes("@")) {
      return json({ error: "Enter a valid email address." });
    }
    if (!isXvetEmail(email)) {
      return json({ error: "Only @xvetgermany.com emails can be used." });
    }
    if (body.checkOnly) {
      return json({ ok: true, email });
    }
    if (!redirectTo || !isAllowedRedirect(redirectTo)) {
      return json({ error: "Sign-in must return to the workshop tool." });
    }

    const url = WORKSHOP_PROJECT_URL;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !key) return json({ error: "Auth is not configured." });

    const created = await adminPost(url, key, "/auth/v1/admin/users", {
      email,
      email_confirm: true,
    });
    if (!created.res.ok) {
      const raw = String(created.payload.msg || created.payload.error_description || created.payload.error || "");
      const exists = created.res.status === 422 || /already|registered|exists/i.test(raw);
      if (!exists) {
        return json({ error: raw || "Could not create the workshop account." });
      }
    }

    const link = await adminPost(url, key, "/auth/v1/admin/generate_link", {
      type: "magiclink",
      email,
      redirect_to: redirectTo,
    });
    if (!link.res.ok) {
      const raw = String(link.payload.msg || link.payload.error_description || link.payload.error || "");
      return json({ error: raw || "Could not start sign-in." });
    }

    const tokenHash = hashedTokenOf(link.payload);
    if (!tokenHash) return json({ error: "Could not start sign-in." });

    let verified = await adminPost(url, key, "/auth/v1/verify", {
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (!verified.res.ok) {
      verified = await adminPost(url, key, "/auth/v1/verify", {
        type: "email",
        token_hash: tokenHash,
      });
    }
    const session = verified.res.ok ? sessionOf(verified.payload) : null;
    if (!session) {
      const raw = String(verified.payload.msg || verified.payload.error_description || verified.payload.error || "");
      return json({ error: raw || "Could not complete sign-in." });
    }

    return json({ ok: true, email, session });
  } catch {
    return json({ error: "Could not complete sign-in." });
  }
});
