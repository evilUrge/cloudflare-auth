<div align="center">
  <img src="admin/public/logo.svg" alt="Cloudflare Auth Service Logo" width="180" />

  # Cloudflare Auth Service

  [![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange?style=for-the-badge&logo=cloudflare)](https://workers.cloudflare.com/)
  [![Hono](https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono&logoColor=white)](https://hono.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
  [![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

  <p align="center">
    <b>Secure, scalable, and developer-friendly authentication for the modern web.</b><br />
    Deploy in seconds to the Edge with Cloudflare Workers and D1.
  </p>
</div>

---

## 🚀 Why Cloudflare Auth?

- **Global Scale**: Runs on Cloudflare's global edge network for low-latency authentication anywhere.
- **Cost Effective**: leveraging Cloudflare Workers and D1's generous free tiers.
- **Data Ownership**: You own your user data. No vendor lock-in.
- **Developer First**: Built with modern tools (Hono, Drizzle, React) for a great DX.

## ✨ Features

- 🏢 **Multi-Project Support**: Isolated user tables for each of your projects.
- 🔐 **JWT Authentication**: Secure, per-project JWT secrets with configurable expiry.
- 🌐 **OAuth Integration**: Drop-in support for Google, GitHub, Microsoft, Apple, and custom providers.
- 🛡️ **Admin Interface**: A beautiful, separate admin UI for managing your projects and users.
- 🌓 **Theme Support**: Dark/Light mode support in Admin UI.
- 🚦 **Rate Limiting**: Built-in, configurable rate limits to protect your API.
- 📜 **Audit Logging**: Comprehensive logging of all security events for compliance.
- 📧 **Email Integration**: First-class support for major providers, managed via UI:
  - SendGrid
  - Mailgun
  - Postmark
  - Resend
  - SMTP

## 🛡️ Security Best Practices

### Traffic Filtering

To keep your authentication service secure and performant, we strongly recommend configuring a **Cloudflare Custom Rule (WAF)** to filter out unwanted traffic. This ensures that only legitimate API calls and Admin UI access reach your Worker, saving costs and reducing the attack surface.

**Recommended WAF Expression:**

```
(http.request.full_uri wildcard r"https://auth.yourdomain.com/*" and not starts_with(http.request.uri.path, "/admin") and not starts_with(http.request.uri.path, "/api"))
```

*Replace `auth.yourdomain.com` with your actual authentication domain.*

This rule blocks requests that do not target the `/admin` interface or the `/api` endpoints, preventing bots and scanners from probing unrelated paths.

## 🛠️ Prerequisites

- [Node.js](https://nodejs.org/) (v24 or later)
- [Cloudflare Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

## ⚡️ Setup & Deployment

### 1. Install Dependencies

```bash
npm install
cd admin && npm install && cd ..
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and fill in your values:
- **Admin Secrets**: Generate secure random strings for session and encryption keys.

**Note:** Email configuration is managed directly in the Admin Interface under "Settings" -> "Email Providers".

### 3. Database Setup

Create a D1 database in your Cloudflare account:

```bash
wrangler d1 create auth-db
```

Update `wrangler.toml` with the `database_id` from the output.

Apply migrations:

```bash
# For local development
npm run db:migrate:local

# For production
npm run db:migrate
```

### 4. Admin UI Build

Build the admin interface:

```bash
cd admin
npm run build
cd ..
```

### 5. Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## 💻 Development

Start the local development server:

```bash
npm run dev
```

The service will be available at `http://localhost:8787`.

---

<div align="center">
  <h3>🌟 Show your support</h3>
  <p>Give a ⭐️ if this project helped you!</p>
  <p>Found a bug? <a href="https://github.com/evilurge/cloudflare-auth/issues">Open an issue</a>.</p>
</div>
