-- Migration: Add allowed_origins column to projects
-- Description: Per-project CORS allowlist for /api/auth/:projectId/* routes.
--              Stored as a JSON array string, mirroring the redirect_urls pattern.
--              null = open (allow any origin), [] = deny all cross-origin,
--              ['*'] = open, ['https://app.tenant.com', ...] = strict allowlist.

ALTER TABLE projects ADD COLUMN allowed_origins TEXT;
