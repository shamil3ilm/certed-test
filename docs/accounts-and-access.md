# Accounts and access

**Last reviewed: 2026-09-29.** Owner column is incomplete — see "Fill this in" below.

Every external account the running system depends on, what it is for, and who controls it. This exists because a handover fails on access long before it fails on code: the repository can be cloned by anyone, and none of it matters if nobody can reach the database, the deployment or the domain.

> **No secrets in this file, ever.** It records _where_ a credential lives and _who_ can issue one. Values belong in the deployment's environment settings and nowhere else. If a value ever lands here, rotate it and remove it.

## The inventory

| System                                    | What it is for                                                                                         | Where its secrets live                                    | Owner                          | Who else has access |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------ | ------------------- |
| **GitHub — `certedapp/wed_cert`**         | The code, CI, branch protection                                                                        | GitHub Actions secrets                                    | _TBC_                          | _TBC_               |
| **GitHub — `shamil3ilm/certed-test`**     | The staging mirror remote                                                                              | —                                                         | _TBC_                          | _TBC_               |
| **Vercel**                                | Hosting and deployment for the web app and the API; all runtime environment variables                  | Vercel → Project → Settings → Environment Variables       | _TBC_                          | _TBC_               |
| **Supabase**                              | Postgres, authentication, RLS. Production project ref `bmqpzrhglpvtiluryuao`, plus the staging project | Supabase dashboard; service-role key mirrored into Vercel | _TBC_                          | _TBC_               |
| **Domain and DNS — `certedacademia.com`** | `www` (marketing) and `app` (portal); the canonical host is `www.certedacademia.com`                   | Registrar account                                         | _TBC (registrar not recorded)_ | _TBC_               |
| **Google Cloud — project `925748687643`** | The OAuth client behind Google sign-in; the consent screen                                             | Google Cloud Console → Credentials                        | _TBC_                          | _TBC_               |
| **Google account for custodial Drive**    | Owns every uploaded attachment, permanently                                                            | Its own password and 2FA; refresh token held in Vercel    | _TBC — not yet created_        | _TBC_               |
| **Resend**                                | Transactional email (`EMAIL_FROM`, API key)                                                            | Resend dashboard; key mirrored into Vercel                | _TBC_                          | _TBC_               |
| **Sentry**                                | Error tracking for the web app, and later the mobile app                                               | Sentry project settings                                   | _TBC_                          | _TBC_               |
| **Apple Developer Program**               | iOS distribution                                                                                       | App Store Connect                                         | _not yet created_              | —                   |
| **Google Play Console**                   | Android distribution                                                                                   | Play Console                                              | _not yet created_              | —                   |

## Fill this in

The Owner column is the point of the document, and only the academy can complete it. For each row, record the **account that controls it** — ideally a role address the institution owns, not an individual's personal login — and who else can currently sign in.

Two rules worth holding to as the rows are filled:

1. **Register to the organisation, never to a person.** An account in a staff member's name becomes a problem the day that person leaves, and the problem surfaces at the worst possible moment: a domain renewal, an expired certificate, a locked deploy.
2. **Every system needs a second person with access**, or the academy has a single point of failure with a pulse.

## Rotation and offboarding

When someone leaves, or a credential may have been exposed:

1. Remove their access from every row above, not just the obvious ones.
2. Rotate anything they could have read: the Supabase service-role key, `CRON_SECRET`, the Resend key, the Google OAuth client secret, the Drive refresh token.
3. Redeploy, because rotated values only reach the running app on a new deployment.
4. Note the date here, so the next person knows when it was last done.

Related: [environment.md](environment.md) lists every variable and which are secret; [operations.md](operations.md) covers backups, monitoring and incident response; [handover.md](handover.md) tracks what is still open.
