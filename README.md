This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Local database

`npm run dev` talks to a **local** Supabase stack, never production:

```bash
supabase start                              # Postgres + Storage in Docker
for f in db/migrations/*.sql; do \
  docker exec -i supabase_db_softclose psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$f"; done
node scripts/setup-storage.mjs --local      # the private media bucket
npm run maker -- add --email you@example.com --local   # prints a sign-in link
```

The wiring is `.env.development.local`, which Next loads ahead of `.env.local`
in development. `.env.local` still points at production, and the scripts in
`scripts/` read it directly — so the scrapers and `npm run maker` act on
**production** unless you pass `--local`. Each of them prints its target before
writing.

Migrations go through `psql` in the container rather than `supabase db query
--local`, which cannot execute multi-statement files.

### Dev without AI spend

- `npm run dev:mock` — the whole funnel runs against canned AI responses
  (`src/lib/api/mock-fixtures/`): instant, free, no OpenAI key needed. Renders
  come from a bundled sample image; an amber "MOCK AI" pill marks the mode.
  Rate limits are bypassed in mock mode.
- `/builder` (dev-only route) — jump straight into the builder from contract ×
  hypothesis fixtures, or import a real session's JSON (a `LeadProfile` or a
  `{ profile, hypothesis?, builderState? }` bundle) via the floating harness
  panel.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
