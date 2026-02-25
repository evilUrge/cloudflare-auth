# cloudflare-auth
> Implementation reference for AI agents. Generated for Context7 indexing.

----------------------------------------
TITLE: System Prerequisites
DESCRIPTION: Ensure the environment meets the minimum requirements before installation.
```bash
# Node.js v24 or later required
node -v

# Cloudflare Wrangler CLI required
npm install -g wrangler
```
----------------------------------------

----------------------------------------
TITLE: Install service dependencies
DESCRIPTION: Install dependencies for the Worker and the Admin UI.
```bash
# Prerequisite: Node.js and Wrangler installed
npm install
cd admin && npm install && cd ..
```
----------------------------------------

----------------------------------------
TITLE: Configure wrangler.toml bindings
DESCRIPTION: Configure D1 and static asset bindings required by the service.
```toml
# Prerequisite: create a D1 database before setting database_id
main = "src/index.ts"

[assets]
directory = "./admin/dist"
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = "auth-db"
database_id = "your-database-id"
migrations_dir = "migrations"

[vars]
PASSWORD_RESET_BASE_URL = "https://your-app.com"
EMAIL_CONFIRMATION_BASE_URL = "https://your-app.com"
```
----------------------------------------

----------------------------------------
TITLE: Configure Local Development Secrets
DESCRIPTION: Create a `.dev.vars` file for local secrets. This file is required for `npm run dev`.
```bash
# Copy the example file
cp .dev.vars.example .dev.vars

# Edit .dev.vars and set:
# ADMIN_SESSION_SECRET=... (generate with `openssl rand -base64 32`)
# ENCRYPTION_KEY=... (generate with `openssl rand -base64 32`)
# ADMIN_DOMAIN=localhost:5173
```
----------------------------------------

----------------------------------------
TITLE: Create D1 database
DESCRIPTION: Create the Cloudflare D1 database used by the auth service.
```bash
# Prerequisite: Wrangler authenticated to your Cloudflare account
wrangler d1 create auth-db
```
----------------------------------------

----------------------------------------
TITLE: Apply database migrations
DESCRIPTION: Initialize the schema and seed the default admin user.
```bash
# Prerequisite: D1 database exists and database_id is set in wrangler.toml
npm run db:migrate
```
----------------------------------------

----------------------------------------
TITLE: Apply local database migrations
DESCRIPTION: Initialize the schema for local development.
```bash
# Prerequisite: D1 database binding configured in wrangler.toml
npm run db:migrate:local
```
----------------------------------------

----------------------------------------
TITLE: Set production secrets
DESCRIPTION: Set required secrets for admin sessions and encryption.
```bash
# Prerequisite: Wrangler authenticated and target environment selected
wrangler secret put ADMIN_SESSION_SECRET
wrangler secret put ENCRYPTION_KEY
wrangler secret put ADMIN_DOMAIN
wrangler secret put SENDGRID_API_KEY
```
----------------------------------------

----------------------------------------
TITLE: Build the Admin UI
DESCRIPTION: Build the static admin panel that is served by the Worker.
```bash
# Prerequisite: admin dependencies installed
npm run build:admin
```
----------------------------------------

----------------------------------------
TITLE: Start local development server
DESCRIPTION: Run the Worker locally and serve the admin UI.
```bash
# Prerequisite: migrations applied locally
npm run dev
```
----------------------------------------

----------------------------------------
TITLE: Deploy the auth service
DESCRIPTION: Build the admin UI and deploy the Worker to Cloudflare.
```bash
# Prerequisite: production secrets set and migrations applied
npm run deploy
```
----------------------------------------

----------------------------------------
TITLE: Login as default admin
DESCRIPTION: Authenticate as the seeded admin user to obtain a session token.
```typescript
// Prerequisite: migrations applied and service deployed
const BASE_URL = 'https://your-worker.com';

const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@example.com',
    password: 'Admin123!'
  })
});

const { data: { sessionToken, admin } } = await loginRes.json();
```
----------------------------------------

----------------------------------------
TITLE: Change default admin credentials
DESCRIPTION: Replace the seeded admin password after the first login.
```typescript
// Prerequisite: sessionToken and admin.id from /api/admin/login
const changePasswordRes = await fetch(`${BASE_URL}/api/admin/users/${admin.id}/change-password`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Admin-Session': sessionToken
  },
  body: JSON.stringify({
    currentPassword: 'Admin123!',
    newPassword: 'NewSecurePassword456!'
  })
});

if (!changePasswordRes.ok) {
  throw new Error('Failed to change default admin password');
}
```
----------------------------------------

----------------------------------------
TITLE: Create a project (minimal)
DESCRIPTION: Create a project to obtain a Project ID for auth API calls.
```typescript
// Prerequisite: sessionToken from /api/admin/login
const projectRes = await fetch(`${BASE_URL}/api/admin/projects`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Admin-Session': sessionToken
  },
  body: JSON.stringify({
    name: 'my-app',
    description: 'Production App',
    environment: 'production'
  })
});

const { data: project } = await projectRes.json();
console.log('Project ID:', project.id);
```
----------------------------------------

----------------------------------------
TITLE: Create a project (full config)
DESCRIPTION: Create a project with all available configuration options.
```typescript
// Prerequisite: sessionToken from /api/admin/login
const projectRes = await fetch(`${BASE_URL}/api/admin/projects`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Admin-Session': sessionToken
  },
  body: JSON.stringify({
    name: 'my-app',
    description: 'Production App',
    environment: 'production',
    jwtExpirySeconds: 3600,
    refreshTokenExpirySeconds: 604800,
    siteUrl: 'https://your-app.com',
    redirectUrls: ['https://your-app.com/callback']
  })
});

const { data: project } = await projectRes.json();
console.log('Project ID:', project.id);
```
----------------------------------------

----------------------------------------
TITLE: Register a user
DESCRIPTION: Create a new user and receive access and refresh tokens.
```typescript
// Prerequisite: projectId created via /api/admin/projects
const response = await fetch(`${BASE_URL}/api/auth/${projectId}/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'Password123!',
    displayName: 'John Doe'
  })
});

const { data } = await response.json();
```
----------------------------------------

----------------------------------------
TITLE: Login and receive tokens
DESCRIPTION: Authenticate a user and receive access and refresh tokens.
```typescript
// Prerequisite: projectId created via /api/admin/projects
const response = await fetch(`${BASE_URL}/api/auth/${projectId}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'Password123!'
  })
});

const { data } = await response.json();
```
----------------------------------------

----------------------------------------
TITLE: Protect a route with redirect
DESCRIPTION: Validate the access token via the auth service and redirect unauthenticated users.
```typescript
// Prerequisite: accessToken from /api/auth/:projectId/login
export async function handleRequest(request: Request): Promise<Response> {
  const authHeader = request.headers.get('Authorization') || '';

  const authRes = await fetch(`${BASE_URL}/api/auth/${projectId}/me`, {
    headers: { Authorization: authHeader }
  });

  if (authRes.status === 401) {
    return Response.redirect('https://your-app.com/login', 302);
  }

  const { data: user } = await authRes.json();
  return new Response(JSON.stringify({ user }), { status: 200 });
}
```
----------------------------------------

----------------------------------------
TITLE: Access the authenticated user
DESCRIPTION: Retrieve the current user with a valid access token.
```typescript
// Prerequisite: accessToken from /api/auth/:projectId/login
const response = await fetch(`${BASE_URL}/api/auth/${projectId}/me`, {
  headers: { Authorization: `Bearer ${accessToken}` }
});

const { data: user } = await response.json();
```
----------------------------------------

----------------------------------------
TITLE: Check auth status without redirect
DESCRIPTION: Check whether a user is authenticated and continue without redirecting.
```typescript
// Prerequisite: accessToken from /api/auth/:projectId/login
const response = await fetch(`${BASE_URL}/api/auth/${projectId}/me`, {
  headers: { Authorization: `Bearer ${accessToken}` }
});

if (response.status === 401) {
  return { authenticated: false };
}

const { data: user } = await response.json();
return { authenticated: true, user };
```
----------------------------------------

----------------------------------------
TITLE: Refresh an access token
DESCRIPTION: Exchange a refresh token for a new access token.
```typescript
// Prerequisite: refreshToken from /api/auth/:projectId/login
const response = await fetch(`${BASE_URL}/api/auth/${projectId}/refresh`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken })
});

const { data } = await response.json();
```
----------------------------------------

----------------------------------------
TITLE: Logout and revoke refresh token
DESCRIPTION: Invalidate the refresh token to end the session.
```typescript
// Prerequisite: refreshToken from /api/auth/:projectId/login
await fetch(`${BASE_URL}/api/auth/${projectId}/logout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken })
});
```
----------------------------------------

----------------------------------------
TITLE: Full authentication flow
DESCRIPTION: End-to-end client flow for register, login, refresh, and logout.
```typescript
// Prerequisite: projectId created via /api/admin/projects
const registerRes = await fetch(`${BASE_URL}/api/auth/${projectId}/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, displayName })
});
const registerData = await registerRes.json();

const loginRes = await fetch(`${BASE_URL}/api/auth/${projectId}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const loginData = await loginRes.json();

const meRes = await fetch(`${BASE_URL}/api/auth/${projectId}/me`, {
  headers: { Authorization: `Bearer ${loginData.data.accessToken}` }
});
const meData = await meRes.json();

const refreshRes = await fetch(`${BASE_URL}/api/auth/${projectId}/refresh`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken: loginData.data.refreshToken })
});
const refreshData = await refreshRes.json();

await fetch(`${BASE_URL}/api/auth/${projectId}/logout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken: refreshData.data.refreshToken })
});
```
----------------------------------------

----------------------------------------
TITLE: Handle auth errors
DESCRIPTION: Handle common auth error responses by status code.
```typescript
try {
  const res = await fetch(`${BASE_URL}/api/auth/${projectId}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!res.ok) {
    const errorData = await res.json();
    if (res.status === 400) console.error('Validation:', errorData.error);
    if (res.status === 401) console.error('Auth failed:', errorData.error);
    if (res.status === 403) console.error('Forbidden:', errorData.error);
    if (res.status === 429) console.error('Rate limit:', errorData.error);
  }
} catch (e) {
  console.error('Network error', e);
}
```
----------------------------------------

----------------------------------------
TITLE: Handle email confirmation
DESCRIPTION: Verify a user's email using the token from the confirmation URL.
```typescript
// Prerequisite: token from confirmation email link
const response = await fetch(
  `${BASE_URL}/api/auth/${projectId}/confirm-email?token=${token}`,
  { method: 'GET' }
);

const result = await response.json();
```
----------------------------------------

----------------------------------------
TITLE: Handle rate limiting retries
DESCRIPTION: Retry requests after 429 responses using the Retry-After header.
```typescript
async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
  const response = await fetch(url, options);

  if (response.status === 429) {
    if (retries <= 0) throw new Error('Rate limit exceeded');
    const retryAfter = response.headers.get('Retry-After');
    const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
    await new Promise(resolve => setTimeout(resolve, waitMs));
    return fetchWithRetry(url, options, retries - 1);
  }

  return response;
}
```
----------------------------------------
