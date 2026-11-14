# Deployments

Live list of what exists. Phase 9 adds the demo deployment and the drills; keep this file current whenever a deployment or project changes. Secrets are never written here.

## Convex (project `molbhav`, team `jay-agarwal`)
| Deployment | Name | Region | Used by |
|---|---|---|---|
| dev | `adorable-clam-29` | US East | local development (`.env.local`), Claude Code's `npx convex dev --once`, Bolna trial agents (Phase 8B) |
| prod (default) | `cheery-tortoise-144` | EU Ireland (R16) | the Vercel production build |
| demo | not created yet | — | Phase 9 (`molbhav-demo`, a separate project) |

HTTP actions (webhooks) are served from `https://<name>.convex.site` (dev) and `https://cheery-tortoise-144.eu-west-1.convex.site` (prod).

Convex Auth (`@convex-dev/auth` 0.0.98, Anonymous provider) is set up on dev (`SITE_URL=http://localhost:3000`) and prod (`SITE_URL=https://molbhav-weld.vercel.app`): `JWT_PRIVATE_KEY`, `JWKS` and `SITE_URL` are set on each.

## Vercel (team `ganges1`, Hobby; project `molbhav`)
- Production URL: **https://molbhav-weld.vercel.app**
- Build: `vercel.json` (`npx convex deploy --cmd 'pnpm build'`, pnpm via Corepack).
- Only production builds run (`ignoreCommand`): Convex preview deploy keys aren't set up, so phones test through the `cloudflared` tunnel.
- Env (names only): `CONVEX_DEPLOY_KEY` (Production, Convex deploy key "vercel-production"), `ENABLE_EXPERIMENTAL_COREPACK=1`.
- Deploys run from the CLI (`npx vercel deploy --prod --scope ganges1`). **Git auto-deploys need a GitHub login connection** on the Vercel account (Account Settings → Authentication → connect GitHub `ijayagarwal`), then `npx vercel git connect --scope ganges1`.

## GitHub
- Repo: https://github.com/ijayagarwal/molbhav (private). CI: `.github/workflows/ci.yml` (typecheck, lint, test) on every push to `main` and every PR.
