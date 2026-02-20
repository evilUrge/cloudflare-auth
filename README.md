<div align="center">
  <img src="admin/public/logo.svg" alt="Cloudflare Auth Service Logo" width="180" />
</div>

A generic, multi-project authentication service deployable on Cloudflare Workers with D1 database.

## Features

- **Multi-Project Support**: Each project has its own isolated user table
- **JWT Authentication**: Per-project JWT secrets with configurable expiry
- **OAuth Integration**: Support for Google, GitHub, Microsoft, Apple, and custom providers
- **Admin Interface**: Separate admin authentication for managing projects
- **Theme Support**: Dark/Light mode support in Admin UI
- **Rate Limiting**: Configurable rate limits per project
- **Audit Logging**: Comprehensive logging of all security events
- **Per-Project User Isolation**: Complete data separation between projects
- **Email Integration**: Built-in support for multiple email providers, managed directly via the Admin UI:
  - **SendGrid**
  - **Mailgun**
  - **Postmark**
  - **Resend**
  - **SMTP**

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Cloudflare Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

## Setup & Deployment

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

**Note:** Email configuration is now managed directly in the Admin Interface under "Settings" -> "Email Providers".

### 3. Database Setup

Create a D1 database in your Cloudflare account (if you haven't already):

```bash
wrangler d1 create auth-db
```

Update `wrangler.toml` with the `database_id` from the output (this project is already configured with a database ID, but you should update it if you create a new one).

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

## Development

Start the local development server:

```bash
npm run dev
```

The service will be available at `http://localhost:8787`.
