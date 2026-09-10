import { Context, Next } from 'hono';
import type { Env } from '../types';
import { projectService } from '../services/project-service';

const PER_PROJECT_PATH_RE = /^\/api\/auth\/([^/]+)(?:\/|$)/;

function appendVaryToHeaders(headers: Headers, headerName: string) {
  const existing = headers.get('Vary') ?? '';
  const parts = new Set(
    existing
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  parts.add(headerName);
  headers.set('Vary', [...parts].join(', '));
}

function isOriginAllowed(origin: string, allowed: string[] | null): boolean {
  if (allowed === null) return true;
  if (allowed.includes('*')) return true;
  return allowed.includes(origin);
}

/**
 * Run the handler chain and return a Response that has the requested Vary
 * token merged into the existing Vary header. We must wrap (not mutate) the
 * response because Hono finalizes it as soon as the handler returns.
 */
async function runWithMergedVary(
  c: Context<{ Bindings: Env }>,
  next: Next,
  headerName: string
): Promise<Response> {
  await next();
  const res = c.res;
  appendVaryToHeaders(res.headers, headerName);
  return res;
}

async function handlePerProject(
  c: Context<{ Bindings: Env }>,
  projectId: string,
  next: Next
) {
  const origin = c.req.header('Origin');
  const project = await projectService.getProject(c.env, projectId);

  // Project not found: fall through (route handler returns 404). Do not leak existence via CORS.
  if (!project) {
    return runWithMergedVary(c, next, 'Origin');
  }

  const allowed = isOriginAllowed(origin ?? '', project.allowedOrigins ?? null);

  if (!allowed) {
    if (c.req.method === 'OPTIONS') {
      const res = new Response(null, { status: 403 });
      appendVaryToHeaders(res.headers, 'Origin');
      return res;
    }
    return runWithMergedVary(c, next, 'Origin');
  }

  // Allowed. Set CORS headers (only when there is an Origin to echo).
  if (origin) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    c.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Admin-Session'
    );
    c.header('Access-Control-Max-Age', '86400');
  }
  c.header('Vary', 'Origin');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  return runWithMergedVary(c, next, 'Origin');
}

async function handleAdminOrGlobal(
  c: Context<{ Bindings: Env }>,
  next: Next
) {
  const origin = c.req.header('Origin');
  const adminDomain = c.env.ADMIN_DOMAIN;

  if (origin) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    c.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Admin-Session'
    );
    c.header('Access-Control-Max-Age', '86400');
  } else if (adminDomain) {
    c.header('Access-Control-Allow-Origin', adminDomain);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    c.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Admin-Session'
    );
    c.header('Access-Control-Max-Age', '86400');
  }
  // else: no Origin and no ADMIN_DOMAIN → omit ACAO/ACAC entirely
  // (avoids the spec-invalid "*" + credentials combo).

  c.header('Vary', 'Origin');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  return runWithMergedVary(c, next, 'Origin');
}

/**
 * CORS middleware
 *
 * Per-project routes (/api/auth/:projectId/*): origin allowlist is governed by
 * the project's `allowedOrigins` field (null = open, [] = deny all, ['*'] = open,
 * exact origins = strict allowlist).
 *
 * All other routes (admin UI, admin API, health, static): governed by the
 * ADMIN_DOMAIN env var with the previous global behavior, plus correct Vary.
 */
export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const match = PER_PROJECT_PATH_RE.exec(c.req.path);
  if (match) {
    const projectId = decodeURIComponent(match[1]);
    return handlePerProject(c, projectId, next);
  }
  return handleAdminOrGlobal(c, next);
}
