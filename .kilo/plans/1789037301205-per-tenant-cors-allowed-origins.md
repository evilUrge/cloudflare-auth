# Per-Tenant `allowedOrigins` CORS — Hotfix Plan

## Goal

Replace the single global `ADMIN_DOMAIN` CORS knob with a per-`Project` `allowedOrigins` allowlist, so each tenant (project) can declare exactly which frontend origins may call its `/api/auth/:projectId/*` endpoints. While we're in the middleware, also fix three latent CORS bugs that are the most likely cause of the reported tenant failures.

## Background — why this is a hotfix, not a feature

`src/middleware/cors.ts` is 23 lines and reflects the request `Origin` for everyone. The reported "CORS errors coming from our auth service" are most likely produced by:

1. Missing `Vary: Origin` → Cloudflare edge cache serves one tenant's `Access-Control-Allow-Origin` to a different tenant's browser.
2. `Access-Control-Allow-Origin: *` falling back while `Access-Control-Allow-Credentials: true` is always set → spec-invalid combination that some clients will reject.
3. No way for an admin to actually lock down origins today (`ADMIN_DOMAIN` is a single global value, used by both admin UI and tenant frontends, with no per-tenant control).

## Resolved design decisions

| Decision | Choice |
|---|---|
| Default for unset `allowedOrigins` on a project | **Allow all** (preserves current behavior, zero disruption for existing tenants — opt-in lockdown) |
| Wildcard support | **Exact origins only**, with a single `*` entry meaning "allow any origin" for that project |
| Admin UI routes (`/admin/*`, `/api/admin/*`) | Keep current `ADMIN_DOMAIN` behavior (unchanged) |
| Per-project routes (`/api/auth/:projectId/*`) | New per-project allowlist |
| Rejected preflight response | `403` with no `Access-Control-Allow-Origin` header |
| Existing project rollout | No change — `allowedOrigins` is null, middleware allows all (same as today) |

## Affected files

| Layer | File | Change |
|---|---|---|
| DB | `migrations/0001_add_project_allowed_origins.sql` (NEW) | `ALTER TABLE projects ADD COLUMN allowed_origins TEXT` (JSON array, nullable) |
| DB schema | `src/db/schema.ts` | Add `allowedOrigins: text('allowed_origins')` to `projects` table (after `redirectUrls`, ~line 49) |
| Types | `src/types/index.ts` | Add `allowedOrigins: string[] \| null` to `Project` and to `CreateProjectData` (~line 86, 99) |
| Validation | `src/utils/validation.ts` | Add `allowedOrigins: z.array(z.string().url()).max(100).optional()` to `createProjectSchema` and `updateProjectSchema` |
| Service | `src/services/project-service.ts` | (a) Parse `allowedOrigins` JSON → array in `getProject`/`listProjects` (mirror `redirectUrls` pattern at lines 197, 237, 273). (b) Stringify array → JSON in `createProject`/`updateProject` (mirror `redirectUrls` at line 327). |
| Middleware | `src/middleware/cors.ts` | **Rewrite** — see "CORS middleware spec" below |
| Admin UI | `admin/src/pages/Projects.tsx` | Add `allowedOrigins` state + textarea field (mirror `redirectUrls` field at lines 306, 318, 424) |
| Admin UI | `admin/src/pages/ProjectDetail.tsx` | Same — mirror `redirectUrls` field at lines 68, 85, 100, 467 |
| Tests | `test/middleware/cors.test.ts` (NEW) | Full coverage per CLAUDE.md TDD rule |
| Tests | `test/services/project-service.test.ts` | Add cases for `allowedOrigins` parse/serialize round-trip |
| Tests | `test/utils/validation.test.ts` | Add cases for `allowedOrigins` schema |
| Docs | `README.md` | Rewrite CORS section (lines 53-59) to describe per-project allowlist, link ADMIN_DOMAIN to admin UI only |

## CORS middleware spec (`src/middleware/cors.ts` rewrite)

**Input**: Hono context.

**Route classification**:
- If `c.req.path` matches `/api/auth/:projectId/*`: **per-project mode**. Load the project via `projectService.getProject(env, projectId)`.
- Else: **admin/global mode** — keep current `ADMIN_DOMAIN` behavior with the bug fixes below.

**Per-project mode**:
1. Look up project by `:projectId`. If project not found → fall through to next() (let the route handler return 404; do not leak project existence via CORS).
2. Read `Origin` header.
3. Compute `allowed`:
   - If `project.allowedOrigins == null` OR contains `*` → `allowed = true` (open).
   - If `project.allowedOrigins` is an empty array `[]` → `allowed = false` (deny all cross-origin).
   - Else → `allowed = allowedOrigins.includes(origin)`.
4. If `!allowed`:
   - On `OPTIONS` preflight: return `403` with no `Access-Control-Allow-Origin` header. Do NOT echo the rejected origin.
   - For all other methods: do not set any `Access-Control-Allow-Origin`. Call `next()` — the route still runs (this lets server-to-server keep working if the project later decides to use API keys), but the browser will refuse to expose the response.
5. If `allowed`:
   - Set `Access-Control-Allow-Origin: <echoed origin>` — never `*` when `Access-Control-Allow-Credentials: true` is set.
   - Set `Vary: Origin`.
   - Set `Access-Control-Allow-Credentials: true`.
   - Set `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`.
   - Set `Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Session`.
   - Set `Access-Control-Max-Age: 86400` (cache preflight 24h).
   - On `OPTIONS` preflight: return `204` with no body (use `c.body(null, 204)`, not `c.text('', 204)`).

**Admin/global mode**:
- Same as today's behavior EXCEPT: always set `Vary: Origin`, and if there's no `Origin` header AND no `ADMIN_DOMAIN` env var, do NOT send `Access-Control-Allow-Origin: *` together with `Access-Control-Allow-Credentials: true`. In that case, omit `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials` entirely (server-to-server without Origin can still reach the route; browsers will refuse).

**Always**:
- After setting CORS headers, append `Origin` to any existing `Vary` (don't clobber). Helper:
  ```ts
  const existingVary = c.res.headers.get('Vary') ?? '';
  const varyParts = new Set(existingVary.split(',').map(s => s.trim()).filter(Boolean));
  varyParts.add('Origin');
  c.header('Vary', [...varyParts].join(', '));
  ```
- Set headers BEFORE `next()` so the route handler's response carries them.

**Caching**: Add `Cache-Control: no-store` on per-project `/api/auth/:projectId/*` responses if not already set by the handler, to prevent edge cache from holding a stale `Access-Control-Allow-Origin`. (Verify with the team — the existing auth responses already include `Cache-Control: no-store` implicitly via JSON bodies, but making it explicit is safer.)

## Test plan (TDD per `CLAUDE.md`)

Tests MUST be written first. File: `test/middleware/cors.test.ts`.

Required cases (each in its own `it`):
1. Per-project route, no `allowedOrigins` set (null) → echoes `Origin`, sets `Vary: Origin`, sets credentials.
2. Per-project route, `allowedOrigins` contains `*` → echoes any `Origin`.
3. Per-project route, `allowedOrigins = ['https://app.tenant.com']` and request `Origin = https://app.tenant.com` → echoes it.
4. Per-project route, `allowedOrigins = ['https://app.tenant.com']` and request `Origin = https://evil.com` → no `Access-Control-Allow-Origin` header on response.
5. Per-project route, `allowedOrigins = []` and request `Origin = https://anything.com` → no `Access-Control-Allow-Origin`.
6. Per-project route, OPTIONS preflight from allowed origin → `204` no body, all CORS headers present, `Access-Control-Max-Age: 86400`.
7. Per-project route, OPTIONS preflight from rejected origin → `403` no `Access-Control-Allow-Origin`.
8. Admin route, no `Origin` header, no `ADMIN_DOMAIN` env → no `Access-Control-Allow-Origin` and no `Access-Control-Allow-Credentials` (do not send invalid `* + true` combo).
9. Admin route, `Origin` header present → echoes `Origin`, sets `Vary: Origin`.
10. Per-project route, response includes `Vary` from downstream handler → `Vary` contains both the downstream value and `Origin` (no clobber).
11. No `Origin` header on per-project route (server-to-server) → no `Access-Control-Allow-Origin`, but route still runs.

Mocking: use `vi.fn()` for `projectService.getProject`. Build a tiny Hono app in each test that registers the middleware and one fake route, then call `app.fetch(req, env)`.

## Validation steps before ship

1. `npm run type-check` — no TypeScript errors.
2. `npm test -- test/middleware/cors.test.ts` — new tests pass.
3. `npm test -- test/services/project-service.test.ts` — updated tests pass.
4. `npm test` — full suite green; no regression in existing tests.
5. `npm run db:migrate:local` — verify the new migration applies cleanly on a fresh DB and on an existing one (idempotent `ALTER TABLE ... ADD COLUMN`).
6. `npm run dev` + manual smoke: hit `http://localhost:8787/api/auth/<existing-project>/register` with `Origin: http://localhost:3000` from a browser and verify preflight + actual request succeed.
7. Manually set `allowedOrigins = ['http://localhost:3000']` in admin UI, repeat from `http://localhost:4000` → request should be rejected (browser console shows CORS error).

## Rollout / migration plan

1. **Deploy middleware + schema + admin UI in one release.** Because `allowedOrigins` defaults to "allow all" for projects that don't have it set, no tenant breaks.
2. **Tenant communication (recommended, not blocking)**: brief note to existing tenants explaining the new lockdown capability and that their existing setups are unaffected until they configure `allowedOrigins`.
3. **Optional follow-up (out of scope for this hotfix)**: per-tenant communication that defaults to "deny all cross-origin" once tenants have been given a window to configure. That is a breaking change and should be a separate, communicated rollout.

## Out of scope

- Migrating `redirectUrls` (OAuth callback allowlist) to use the same allowlist — separate concern, separate feature.
- Adding CORS-related metrics / audit events.
- Refactoring `redirectUrls` JSON storage to a relational join table.
- Changing the admin UI's theming or layout for the new field.
- Wildcard subdomain matching (`https://*.example.com`).

## Open questions

None — all material design decisions resolved above.
