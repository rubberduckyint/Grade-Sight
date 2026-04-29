# Grade-Sight — App State Inventory for Design Handoff

**Generated:** 2026-04-24
**Purpose:** Complete inventory of every UI surface and styling decision currently in `apps/web`, so the "Gradelens Editorial" theme (Source Serif 4 + Inter, warm paper, pen-ink blue, warm near-black, amber for diagnostic insight) can be retrofitted exhaustively without missing surfaces.

---

## 1. Route / Page Inventory

### App-router pages (`apps/web/app/`)

| Route | File | Auth | Purpose | Status | UI state |
|---|---|---|---|---|---|
| `/` | `app/page.tsx` | public | Marketing landing — product tagline + three CTAs (parent signup, teacher signup, sign-in link) | shipped | Minimal real UI (inline Tailwind utilities, no theme) |
| `/dashboard` | `app/dashboard/page.tsx` | authenticated (via middleware) | Post-login landing — shows name, role, org name, sign-out | shipped | Placeholder text-only; no real dashboard content yet |
| `/sign-in/[[...sign-in]]` | `app/sign-in/[[...sign-in]]/page.tsx` | public | Renders Clerk `<SignIn />` (catch-all to support Clerk's sub-routes) | shipped | Clerk-hosted UI; wrapper only |
| `/sign-up/parent/[[...sign-up]]` | `app/sign-up/parent/[[...sign-up]]/page.tsx` | public | Clerk `<SignUp />` with `unsafeMetadata.role = "parent"` + intro copy | shipped | Clerk-hosted UI; wrapper + heading |
| `/sign-up/teacher/[[...sign-up]]` | `app/sign-up/teacher/[[...sign-up]]/page.tsx` | public | Clerk `<SignUp />` with `unsafeMetadata.role = "teacher"` + intro copy | shipped | Clerk-hosted UI; wrapper + heading |

### Planned routes (Spec 4 — Stripe, approved, not yet implemented)

| Route | Expected file | Auth | Purpose | Status |
|---|---|---|---|---|
| `/paywall` | `app/paywall/page.tsx` | authenticated | Blocks gated features when entitlement fails; branches on subscription state (trial-ended, canceled, past-due) | planned-not-built |
| `/settings/billing` | `app/settings/billing/page.tsx` | authenticated | Current plan, status, trial-end or next-billing date, "Manage billing" → Stripe Customer Portal | planned-not-built |
| `/dashboard` (update) | `app/dashboard/page.tsx` | authenticated | Add `TrialBanner` above existing content when trial ≤7 days out | planned-not-built |

### API routes

- **None in `apps/web`.** All API traffic goes to the FastAPI service (`apps/api`) via `lib/api.ts`. There is no Next.js route handler under `app/api/`.

### Special Next.js files

- No `not-found.tsx`, `error.tsx`, `global-error.tsx`, `loading.tsx`, `template.tsx`, or route groups anywhere.
- No `robots.ts`, `sitemap.ts`, `opengraph-image.tsx`, or `manifest.ts`.
- Default `favicon.ico` is the Next.js boilerplate.

---

## 2. Component Inventory

- **`apps/web/components/` does not exist.** Zero custom React components authored to date.
- All UI is inlined in page files using Tailwind utility classes.
- shadcn/ui **is not installed** — no `components/ui/` directory, no `components.json`.
- Only third-party React components rendered are from `@clerk/nextjs`: `<ClerkProvider>`, `<SignIn>`, `<SignUp>`, `<SignOutButton>`.

---

## 3. Shared Styling + Theming Setup

### Tailwind

- **Version:** Tailwind **4** (`tailwindcss ^4`, `@tailwindcss/postcss ^4`).
- **No `tailwind.config.ts`/`.js` file exists.** Tailwind 4 uses CSS-based config via `@theme` directives in CSS.
- **PostCSS config** (`postcss.config.mjs`):
  ```js
  { plugins: { "@tailwindcss/postcss": {} } }
  ```

### Global CSS — `apps/web/app/globals.css` (full contents)

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
```

### Design tokens currently defined

| Token | Value (light) | Value (dark) | Scope |
|---|---|---|---|
| `--background` | `#ffffff` | `#0a0a0a` | `:root` |
| `--foreground` | `#171717` | `#ededed` | `:root` |
| `--color-background` | `var(--background)` | — | `@theme` (Tailwind class bridge) |
| `--color-foreground` | `var(--foreground)` | — | `@theme` (Tailwind class bridge) |
| `--font-sans` | `var(--font-geist-sans)` | — | `@theme` |
| `--font-mono` | `var(--font-geist-mono)` | — | `@theme` |

- No accent color, neutral ramp, semantic colors (success/warning/error/info), spacing scale overrides, radii, or shadow tokens defined.
- No typography scale beyond Tailwind defaults.

### Fonts

| Font | How loaded | Variable | Actually applied? |
|---|---|---|---|
| Geist | `next/font/google` in `app/layout.tsx` | `--font-geist-sans` | **No** — `body { font-family: Arial, Helvetica, sans-serif; }` in globals.css overrides it. Variable is wired but unused. |
| Geist Mono | `next/font/google` in `app/layout.tsx` | `--font-geist-mono` | **No** — only exposed as variable; never referenced by a rule or utility class. |

- **Known gap:** the body's `font-family: Arial, Helvetica, sans-serif` is a hold-over from the Next boilerplate and fights the loaded fonts. Retheme should delete that rule, remove the Geist imports, and wire Source Serif 4 + Inter via `next/font/google` with fresh CSS variables.
- No icon font or icon library (`lucide-react`, `heroicons`, etc.) installed.

### shadcn/ui

- **Not installed.** No `components.json`.
- Prerequisites are present: `clsx ^2.1.1`, `tailwind-merge ^3.5.0`, and `cn()` helper at `apps/web/lib/utils.ts`:
  ```ts
  import { type ClassValue, clsx } from "clsx";
  import { twMerge } from "tailwind-merge";
  export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
  }
  ```
- **No Radix UI primitives** installed (no `@radix-ui/*` deps).

### Other styling approaches

- No CSS Modules, no `styled-components`, no Emotion, no vanilla-extract, no Stitches.
- No CSS-in-JS runtime. All styling is Tailwind utility classes applied inline in JSX.

---

## 4. Layout + Navigation

### Root layout — `apps/web/app/layout.tsx`

```tsx
<ClerkProvider>
  <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
    <body className="min-h-full flex flex-col">{children}</body>
  </html>
</ClerkProvider>
```

- Metadata: `{ title: "Create Next App", description: "Generated by create next app" }` — still the boilerplate default.
- No nested layouts under any route segment.
- No route groups.

### Nav, header, footer, app shell

- **None exist.** No `Header`, `Nav`, `Footer`, `Sidebar`, `Shell`, `AppShell`, `OrganizationSwitcher`, `UserMenu`.
- Every page renders its own bare `<main>`. No shared chrome between pages.
- Clerk's `<UserButton>` is not currently rendered anywhere (sign-out is a plain `<SignOutButton>` text button on the dashboard).

### Breakpoints

- Tailwind 4 defaults, unmodified: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px.
- Only two breakpoints actually used in code today:
  - `md:` on `app/page.tsx` (`p-8 md:p-24`)
  - `sm:` on `app/page.tsx` (`flex-col sm:flex-row`)
- No responsive mobile nav, no hamburger, no drawer.

---

## 5. Forms, Inputs, Interactive Primitives

### Forms / inputs in-codebase

- **No custom forms.** No `<form>` elements authored in `apps/web`.
- All authentication form UI comes from Clerk's hosted `<SignIn>` and `<SignUp>` components, which render their own inputs, buttons, validation, social-auth buttons, and flow management. These accept an `appearance` prop for theming but are otherwise opaque.

### Buttons, links, interactive elements

| Element | Location | Implementation |
|---|---|---|
| "Sign up as parent" CTA | `app/page.tsx` | `<Link>` + Tailwind: `rounded-lg border border-gray-300 px-6 py-3 text-base font-medium hover:bg-gray-50` |
| "Sign up as teacher" CTA | `app/page.tsx` | `<Link>` + Tailwind: `rounded-lg bg-black px-6 py-3 text-base font-medium text-white hover:bg-gray-800` |
| "Already have an account? Sign in" | `app/page.tsx` | `<Link>` + Tailwind: `text-sm text-gray-500 underline` |
| Sign-out | `app/dashboard/page.tsx` | Clerk `<SignOutButton>` (default unstyled Clerk button) |

### shadcn primitives in use

- **None.** No `Button`, `Input`, `Dialog`, `Dropdown`, `Popover`, `Tabs`, `Card`, `Sheet`, `Toast`, `Form`, `Tooltip`, `Avatar`, `Badge`, `Select`, `Checkbox`, `RadioGroup`, `Skeleton`, `Alert`, `Separator`, `ScrollArea`, `Command`, etc.

---

## 6. States the Designer Needs to Design For

### Loading states

- **One instance only:** `app/dashboard/page.tsx` renders a plain `<p>Loading…</p>` if `fetchMe()` returns null.
- No `loading.tsx` Suspense fallbacks anywhere.
- No skeletons, shimmer, or spinners.

### Empty states

- **None exist.** Dashboard has no collections/lists yet, so no "You have no X" state has been designed.

### Error states

- **None exist.** No `error.tsx`, no `not-found.tsx`, no `global-error.tsx`.
- `fetchMe()` throws on non-401 non-2xx — the error would surface as a Next.js default error page.
- No form-level error states (Clerk handles its own).

### Toast / notification system

- **None installed.** No `sonner`, no `react-hot-toast`, no shadcn `<Toaster>`, no custom notification system.

### Other interactive states to plan for

- Hover states on two button-styled links (currently `hover:bg-gray-50` and `hover:bg-gray-800`).
- Focus states: Tailwind defaults only; no `focus-visible:` rings explicitly set.
- Disabled states: not used anywhere yet.

---

## 7. In-Flight Specs Not Yet Implemented (UI implications)

All specs live under `docs/superpowers/specs/`.

| Spec | Date | Status | UI implications |
|---|---|---|---|
| `2026-04-21-memory-system-design.md` | 2026-04-21 | shipped (infra only) | **None.** This is the Claude-Code session memory system, no user-facing UI. |
| `2026-04-21-monorepo-scaffolding-design.md` | 2026-04-21 | shipped | **None.** Tooling-only. |
| `2026-04-22-db-schema-migrations-design.md` | 2026-04-22 | shipped | **None.** Backend schema only. |
| `2026-04-22-clerk-auth-integration-design.md` | 2026-04-22 | shipped | Already-shipped UI: landing CTAs, sign-in, sign-up (parent/teacher), dashboard. |
| `2026-04-24-stripe-billing-integration-design.md` | 2026-04-24 | approved, not-built (implementation plan being written next) | **New surfaces required:** `TrialBanner` component, `/paywall` page (three branching states: trial-ended-no-card / canceled-had-card / past-due-defensive), `/settings/billing` page (plan, status, trial-end, manage-billing button → Stripe Customer Portal), dashboard update to host banner. Also needs paywall CTA treatments, trust/billing microcopy style. |

### Future specs acknowledged but not written

- **Spec 5 (reassigned):** generic external-service abstraction (Claude/S3/audit_log wiring). No direct UI — pattern generalization of `stripe_service.py`.
- **Diagnostic engine / assessment upload / eval-set UI:** gated by taxonomy finalization, explicitly not to be built yet per `CLAUDE.md` §5.
- **Email reminders (T-7, T-3, T-1):** deferred to a dedicated Resend-based spec.

---

## 8. Constraints the Designer Must Respect

### Framework / stack

| Constraint | Value |
|---|---|
| Framework | Next.js **16.2.4** (App Router) |
| Router | App Router **only** (no pages router) |
| React | **19.2.4** |
| TypeScript | strict (`strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`) |
| Tailwind | **4** (CSS-based config via `@theme`, not `tailwind.config.*`) |
| PostCSS | `@tailwindcss/postcss` only |
| Package manager | **pnpm** workspaces + Turbo |
| Dev port | 3000 (`next dev --turbopack --port 3000`) |

### Locked component-library choices

- **Auth UI = Clerk hosted components** (`<SignIn>`, `<SignUp>`, `<SignOutButton>`, eventually `<UserButton>`, `<OrganizationSwitcher>`). Theme via Clerk's `appearance` prop — do **not** rebuild auth forms from scratch.
- **No shadcn/ui yet — but expected.** The `cn()` helper, `clsx`, and `tailwind-merge` are already in place, which is shadcn's standard footprint. Plan designs as compositions of shadcn primitives; adding shadcn is the expected install path.
- **No Radix, no Headless UI, no Arco, no MUI, no Chakra.** Do not specify designs that depend on them.

### Styling constraints

- **Tailwind-utility-first.** Custom CSS should be via `@theme` tokens or component-scoped Tailwind classes, not separate `.css` files per component.
- **No CSS-in-JS** (`styled-components`, Emotion, etc.) — pnpm deps forbid introducing them without discussion.
- **Tailwind 4's new syntax only** — deliver design tokens as CSS custom properties mappable into a `@theme` block in `globals.css`. Do not deliver a `tailwind.config.ts` color palette.

### Accessibility

- **No explicit commitment encoded in code yet.** There is no axe-core, no eslint-plugin-jsx-a11y, no Lighthouse CI, no a11y-focused review checklist in the repo.
- **Informal target:** WCAG AA (relevant for edtech procurement downstream). Worth formalizing when the design system lands.
- Tailwind's default focus ring is **not** explicitly configured via `focus-visible:` utilities anywhere — the theme should include a focus style.

### Fixed stack items (CLAUDE.md §2)

- Deployment: Railway, US region, pinned.
- Monitoring: Sentry (not yet integrated in web app).
- Email: Resend (not yet integrated).
- Do not propose alternatives to these without explicit discussion.

### Product scope gates (CLAUDE.md §5)

- Do **not** design mockups for the diagnostic engine, assessment upload, eval-set infra, batch upload, cohort pulse, admin dashboards, or LMS integrations as implementation-ready. These can be aspirational/roadmap only.
- Design work that IS in scope: landing, sign-in, sign-up (parent + teacher), dashboard shell, trial banner, paywall, billing settings.

### Privacy / trust positioning

- Privacy commitments are an acquisition lever, not fine print. Design should surface trust signals prominently (landing hero, footer trust band, dedicated trust page eventually). Hard commitments from `CLAUDE.md` §4: never sell student data, no ads/profiling, no third-party commercial sharing, US-only data, 30-day deletion window, 72-hour incident notification, SDPC NDPA signable, Student Privacy Pledge signatory, Common Sense Privacy evaluation.

### Dual audience from day one

- Every surface must work for **both** parent mode and individual teacher mode. No single-audience hero, dashboard, or copy. District mode is deferred to Phase 3 — do not design for it.

### Error taxonomy as a visual system (future-proofing)

- The core differentiator is a four-category error taxonomy (conceptual, execution, verification, confidence/strategy). It is loaded from the DB at runtime — the visual system must be **extensible** (don't hardcode "exactly four chips" into layouts).
- Tone: supportive, not punitive. Avoid red/green "right/wrong" color logic for diagnostic output. Amber is reserved for diagnostic-insight moments per the new theme spec.

---

## 9. Screenshots / Live URLs

### Staging / production

- **Railway api** is deployed (commit `429ac4e` fixed prod 502, `b81d5f2` added `start.sh`, `d2952e1` trimmed railway.json).
- **Railway web URL:** not documented in repo; ask the operator (`david@rubberduckyinteractive.com`) or check Railway dashboard.
- No separate staging environment.

### Local dev

```bash
# From repo root
docker compose up -d db
pnpm db:migrate
pnpm dev
```

Then visit:

| URL | Renders |
|---|---|
| `http://localhost:3000/` | Landing page |
| `http://localhost:3000/sign-up/parent` | Clerk parent signup |
| `http://localhost:3000/sign-up/teacher` | Clerk teacher signup |
| `http://localhost:3000/sign-in` | Clerk sign-in |
| `http://localhost:3000/dashboard` | Requires signed-in session; redirects to `/sign-in` otherwise |

- Clerk dev-instance keys must be set in `apps/web/.env.local` and `apps/api/.env` (see `apps/web/README.md` and the infra README for setup).
- No Storybook, no isolated component dev environment — every component must be viewed in-app.

---

## 10. Summary: What the Theme Retrofit Will Touch

| Surface | Retrofit scope |
|---|---|
| `app/layout.tsx` | Swap Geist imports for Source Serif 4 + Inter; update `<html>` font variable bindings; update `<title>`/`<description>`. |
| `app/globals.css` | Rewrite the whole file: new token set (paper palette, pen-ink blue, warm near-black, amber), remove hardcoded Arial body font, add focus-ring style, add semantic tokens (surface, surface-muted, border, text-primary, text-muted, accent, insight-amber, etc.). |
| `app/page.tsx` | Re-style landing — hero, CTAs, sign-in link, add trust signals band per privacy positioning. |
| `app/sign-in/**` | Add Clerk `appearance` config. |
| `app/sign-up/parent/**`, `app/sign-up/teacher/**` | Add Clerk `appearance` config; restyle wrapper + heading. |
| `app/dashboard/page.tsx` | Build a real dashboard shell (header with user menu + org, content area); update placeholder text. |
| NEW: `app/paywall/page.tsx` | Design + build (Spec 4). |
| NEW: `app/settings/billing/page.tsx` | Design + build (Spec 4). |
| NEW: `components/` directory | Needs to exist — start with `TrialBanner`, then `AppShell`, `Header`, `Footer`, shadcn primitives as they're pulled in. |
| NEW: shadcn install + `components.json` | Add with a theme preset matching the new tokens. |
| NEW: error/loading/not-found pages | `error.tsx`, `loading.tsx`, `not-found.tsx` at minimum. |
| NEW: toast system | Pick one (suggest shadcn `<Sonner>`); wire into root layout. |

---

**End of inventory.**
