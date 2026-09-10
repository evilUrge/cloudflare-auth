import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Project } from '../../src/types';

// Mock projectService so the middleware can be loaded in isolation
vi.mock('../../src/services/project-service', () => ({
  projectService: {
    getProject: vi.fn(),
  },
}));

// Import after the mock so the middleware sees the mocked module
import { corsMiddleware } from '../../src/middleware/cors';
import { projectService } from '../../src/services/project-service';

const createMockEnv = (overrides: Partial<Env> = {}): Env => ({
  DB: {} as any,
  ASSETS: {} as any,
  ADMIN_SESSION_SECRET: 'test-secret',
  ENCRYPTION_KEY: 'test-encryption-key',
  ADMIN_DOMAIN: undefined,
  ...overrides,
});

const buildApp = () => {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', corsMiddleware);
  app.get('/api/auth/:projectId/ping', (c) => c.json({ ok: true }));
  app.post('/api/auth/:projectId/login', (c) => c.json({ ok: true }));
  app.options('/api/auth/:projectId/login', (c) => c.json({ ok: true }));
  app.get('/api/admin/ping', (c) => c.json({ ok: true }));
  app.get('/admin/ping', (c) => c.text('ok'));
  return app;
};

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'test_project',
  name: 'Test Project',
  description: null,
  environment: 'production',
  jwtSecret: 's',
  jwtAlgorithm: 'HS256',
  jwtExpirySeconds: 3600,
  refreshTokenExpirySeconds: 604800,
  enabled: true,
  userTableName: 'users_test_project',
  siteUrl: null,
  redirectUrls: null,
  allowedOrigins: null,
  createdAt: '',
  updatedAt: '',
  createdBy: null,
  ...overrides,
});

describe('corsMiddleware', () => {
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    app = buildApp();
    env = createMockEnv();
    vi.clearAllMocks();
  });

  it('1. per-project route with allowedOrigins=null echoes Origin and sets Vary+credentials', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue(makeProject({ allowedOrigins: null }));
    const req = new Request('http://localhost/api/auth/test_project/ping', {
      headers: { Origin: 'https://app.tenant.com' },
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.tenant.com');
    expect(res.headers.get('Vary')).toContain('Origin');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('2. per-project route with allowedOrigins=["*"] echoes any Origin', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue(makeProject({ allowedOrigins: ['*'] }));
    const req = new Request('http://localhost/api/auth/test_project/ping', {
      headers: { Origin: 'https://random.example.org' },
    });
    const res = await app.fetch(req, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://random.example.org');
  });

  it('3. per-project route with allowedOrigins containing the request origin echoes it', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue(
      makeProject({ allowedOrigins: ['https://app.tenant.com'] })
    );
    const req = new Request('http://localhost/api/auth/test_project/ping', {
      headers: { Origin: 'https://app.tenant.com' },
    });
    const res = await app.fetch(req, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.tenant.com');
  });

  it('4. per-project route with disallowed origin returns no Access-Control-Allow-Origin', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue(
      makeProject({ allowedOrigins: ['https://app.tenant.com'] })
    );
    const req = new Request('http://localhost/api/auth/test_project/ping', {
      headers: { Origin: 'https://evil.com' },
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('5. per-project route with allowedOrigins=[] denies all cross-origin', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue(makeProject({ allowedOrigins: [] }));
    const req = new Request('http://localhost/api/auth/test_project/ping', {
      headers: { Origin: 'https://anything.com' },
    });
    const res = await app.fetch(req, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('6. per-project OPTIONS preflight from allowed origin returns 204 with all CORS headers', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue(makeProject({ allowedOrigins: ['*'] }));
    const req = new Request('http://localhost/api/auth/test_project/login', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.tenant.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.tenant.com');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
  });

  it('7. per-project OPTIONS preflight from rejected origin returns 403 with no ACAO', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue(
      makeProject({ allowedOrigins: ['https://app.tenant.com'] })
    );
    const req = new Request('http://localhost/api/auth/test_project/login', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('8. admin route with no Origin and no ADMIN_DOMAIN omits ACAO and ACAC', async () => {
    const req = new Request('http://localhost/api/admin/ping');
    const res = await app.fetch(req, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(res.headers.get('Vary')).toContain('Origin');
  });

  it('9. admin route with Origin header echoes it and sets Vary: Origin', async () => {
    const req = new Request('http://localhost/api/admin/ping', {
      headers: { Origin: 'https://admin.tenant.com' },
    });
    const res = await app.fetch(req, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.tenant.com');
    expect(res.headers.get('Vary')).toContain('Origin');
  });

  it('10. per-project route merges downstream Vary with Origin (no clobber)', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue(makeProject({ allowedOrigins: ['*'] }));
    const innerApp = new Hono<{ Bindings: Env }>();
    innerApp.use('*', corsMiddleware);
    innerApp.get('/api/auth/:projectId/ping', (c) => {
      c.header('Vary', 'Accept-Encoding');
      return c.json({ ok: true });
    });
    const req = new Request('http://localhost/api/auth/test_project/ping', {
      headers: { Origin: 'https://app.tenant.com' },
    });
    const res = await innerApp.fetch(req, env);
    const vary = res.headers.get('Vary') ?? '';
    expect(vary).toContain('Origin');
    expect(vary).toContain('Accept-Encoding');
  });

  it('11. per-project route with no Origin header omits ACAO but route still runs', async () => {
    vi.mocked(projectService.getProject).mockResolvedValue(makeProject({ allowedOrigins: ['*'] }));
    const req = new Request('http://localhost/api/auth/test_project/ping');
    const res = await app.fetch(req, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(await res.json()).toEqual({ ok: true });
  });

  it('does not throw "Can\'t modify immutable headers" (Cloudflare Workers regression)', async () => {
    // Simulate Cloudflare Workers' Response: header set() on a finalized
    // response throws "Can't modify immutable headers". We simulate this by
    // patching the global Response so that mutating headers.set after the
    // handler returns throws — exactly what happens in production.
    vi.mocked(projectService.getProject).mockResolvedValue(makeProject({ allowedOrigins: ['*'] }));
    const innerApp = new Hono<{ Bindings: Env }>();
    innerApp.use('*', corsMiddleware);
    innerApp.get('/api/auth/:projectId/ping', (c) => c.json({ ok: true }));

    const RealResponse = globalThis.Response;
    class LockedHeadersResponse extends RealResponse {
      constructor(body: BodyInit | null, init?: ResponseInit) {
        super(body, init);
        // After construction, simulate Workers finalization by making
        // any subsequent .set/.append/.delete on headers throw.
        const headers = this.headers;
        const throwOnMutate = () => {
          throw new TypeError("Can't modify immutable headers");
        };
        Object.defineProperty(headers, 'set', { value: throwOnMutate, configurable: true });
        Object.defineProperty(headers, 'append', { value: throwOnMutate, configurable: true });
        Object.defineProperty(headers, 'delete', { value: throwOnMutate, configurable: true });
      }
    }
    // @ts-ignore - swap globally for this test only
    globalThis.Response = LockedHeadersResponse as any;

    try {
      const req = new Request('http://localhost/api/auth/test_project/ping', {
        headers: { Origin: 'https://app.tenant.com' },
      });
      // Should NOT throw — middleware must construct a new Response, not mutate.
      const res = await innerApp.fetch(req, env);
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.tenant.com');
      expect(res.headers.get('Vary')).toContain('Origin');
    } finally {
      globalThis.Response = RealResponse;
    }
  });
});
