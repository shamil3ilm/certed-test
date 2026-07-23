# Setup Guide

This guide describes the current production setup path for Cert-Ed Academia.

## Overview

The live application depends primarily on:

- Supabase
- your deployment platform
- optional Google configuration depending on which login or Drive-assist features you enable

Important:

- the authoritative database setup is the full migration chain in `supabase/migrations`
- the current migration chain runs from `0001` through `0029`

## 1. Local development

Local development should normally use mock mode.

See:

- [mock-mode.md](./mock-mode.md)

Basic flow:

```bash
npm install
npm run dev
```

## 2. Supabase project setup

Create one Supabase project per environment as needed.

Collect:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

Apply the migrations in order:

- `0001_foundation.sql`
- through `0029_notifications_readonly_content.sql`

Do not stop at the early migrations from older documentation.

## 3. Seed the initial admin

Seed at least one active admin profile before normal sign-in flow is used.

The application is allowlist-first:

- a user must already have a `profiles` row
- first sign-in binds their auth identity to that profile

## 4. Authentication setup

Supabase Auth is the authentication provider.

The current application supports:

- standard sign-in flows for live environments
- mock-mode login for local development only

If Google sign-in is enabled for your environment:

- configure it inside Supabase Auth
- keep redirect URLs aligned with your app host

## 5. Environment variables

At minimum, live environments must define:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
APP_HOSTNAME=
MARKETING_HOSTNAME=
CRON_SECRET=
```

Optional values depend on which integrations are enabled, for example:

- contact form URL
- Drive Picker client values

## 6. Production verification checklist

Before calling an environment usable:

1. apply migrations `0001` through `0029`
2. confirm the first admin can sign in
3. confirm persona resolution works
4. confirm nav and dashboard render correctly for active users
5. confirm notifications, messaging, attendance, and finance flows work
6. confirm RLS-sensitive flows work with real Supabase, not only mock mode

## 7. Related docs

- [schema-reference.md](./schema-reference.md)
- [rls-policy-inventory.md](./rls-policy-inventory.md)
- [persona-model.md](./persona-model.md)
- [../supabase/README.md](../supabase/README.md)
