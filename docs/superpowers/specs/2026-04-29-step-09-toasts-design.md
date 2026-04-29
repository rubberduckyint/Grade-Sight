# Step 09 · Toasts — design

**Reference:** `docs/design/Grade Sight Handoff v2.html` §Implementation Step 09:
> STEP 09 · TOASTS · Wire `<Sonner />` in root layout.
> Themed to paper/ink. Max 3 lines. Never red — use mono eyebrow + neutral body for errors.

**Branch:** `step-09-toasts`. **Mode:** v2 design step — branch + per-step PR.

## Why this exists as a step

Step 09 is small and load-bearing. Steps 10–13 (Diagnosis page, inline correction + viewer, Student page, Operational surfaces) all need a canonical way to surface system feedback — submit confirmations, async failures, save states. Establishing the toast convention now means downstream surfaces call one helper instead of inventing per-page error patterns.

## Discovery: most of the wiring is already done

Step 02 (shadcn install) added the `sonner` primitive at `apps/web/components/ui/sonner.tsx`. The root layout at `apps/web/app/layout.tsx:26-37` already mounts `<Toaster />` with the paper/ink theme:

```tsx
<Toaster
  theme="light"
  toastOptions={{
    classNames: {
      toast: "border border-rule bg-paper text-ink rounded-[var(--radius-sm)] shadow-none",
      title: "font-serif text-base",
      description: "text-sm text-ink-soft",
      actionButton: "bg-ink text-paper rounded-[var(--radius-sm)]",
      cancelButton: "border border-rule text-ink rounded-[var(--radius-sm)]",
    },
  }}
/>
```

So Step 09 isn't "wire Sonner." It's "**finish wiring Sonner** to match the handoff doc's full spec":

1. The error variant ("mono eyebrow + neutral body") doesn't exist yet.
2. The 3-line cap isn't enforced.
3. There's no canonical helper — Step 10–13 callers would each invoke `toast()` directly, drift, and reinvent.
4. (Existing inline `setError()` sites stay as-is. Migration is out of scope; future feature work in those files will move them when convenient.)

## Scope

- **Variants shipped:** `success` and `error`. No `info`, no `warning` — matches the handoff's amber/red restraint rules. Add later only if a real surface demands it.
- **Single canonical helper:** `lib/notify.tsx` exposing `notify.success(title, options?)` and `notify.error(title, options?)`.
- **No migration of existing setError sites.** Form-field validation stays inline (it should — toasts are for system feedback, not field-level validation per the handoff's "max 3 lines" tell). Server-error sites get migrated when their owning feature work picks them up.

## Architecture

One new helper file. One tweak to the existing Sonner config. Demo buttons on `/dev/primitives` for visual verification. Two lines added to `app/layout.tsx`: `closeButton={false}` on the `<Toaster />` and `line-clamp-2` appended to the `toastOptions.classNames.description` className.

Variants are visual-only, achieved by composing the `description` prop as JSX inside the helper. We do **not** route through Sonner's built-in `toast.error()` — that triggers default red icon/styling that fights our editorial palette. The helper renders plain `toast()` calls and constructs the variant treatment in the description JSX.

## Components

| Path | Type | Purpose |
|---|---|---|
| `apps/web/lib/notify.tsx` | new | Canonical entry point. Exposes `notify.success(title, options?)` and `notify.error(title, options?)`. ~40 lines. |
| `apps/web/app/layout.tsx` | tweak | The `<Toaster />` config lives in the root layout (not the `components/ui/sonner.tsx` wrapper). Add `closeButton={false}` and add `line-clamp-2` to the `toastOptions.classNames.description` className. Duration defaults (4s success / 6s error) live in the `notify` helper, not the global Toaster config, so per-call overrides remain easy. ~2-line delta. |
| `apps/web/app/dev/primitives/page.tsx` | tweak | Replace the single "Trigger toast" demo with four buttons: success (no description), success (with description), error (no description), error (with description + custom eyebrow). |

## Helper API

```ts
type NotifyOptions = {
  description?: string;
  duration?: number;
};

type NotifyErrorOptions = NotifyOptions & {
  eyebrow?: string; // defaults to "ERROR"
};

export const notify = {
  success(title: string, options?: NotifyOptions): void { ... },
  error(title: string, options?: NotifyErrorOptions): void { ... },
};
```

**Rendering shape:**

| Call | Renders |
|---|---|
| `notify.success("Student added")` | serif title, single line |
| `notify.success("Student added", { description: "Marcus Park · Grade 8" })` | serif title + sans description (`text-ink-soft`), description `line-clamp-2` |
| `notify.error("Couldn't save student")` | serif title + mono eyebrow `ERROR` (`font-mono text-xs uppercase tracking-[0.14em] text-ink-mute`) |
| `notify.error("Couldn't save", { description: err.message, eyebrow: "UPLOAD FAILED" })` | serif title + mono eyebrow `UPLOAD FAILED` + sans description, description `line-clamp-1` |

The 3-line cap is enforced visually via `line-clamp-*` classes — no JS truncation. The eyebrow takes a line in error toasts; description gets one fewer line of room as a result.

## Data flow

1. Caller invokes `notify.success(title, options?)` or `notify.error(title, options?)` from a server action result, click handler, async transition, etc.
2. Helper composes the description JSX (eyebrow + line-clamped body for errors; plain body for success).
3. Helper calls Sonner's plain `toast(title, { description: <JSX>, duration })`.
4. Sonner renders into the mounted `<Toaster />` in `app/layout.tsx`.

## Error handling

The helper itself has no async or fail paths. Sonner can't fail to render. If the `<Toaster />` weren't mounted, calls would no-op silently — but it's mounted at the root layout, so this isn't a real concern.

## Accessibility

Sonner's default `<Toaster />` sets `role="region"` with `aria-label="Notifications"` and individual toasts have `aria-live="polite"` — screen readers announce them. No additional ARIA wiring needed. Toasts are non-interactive (no buttons or focusable content), so the seven-item checklist's "visible focus ring on every interactive element" doesn't apply to the toast body itself.

## Testing

- **Typecheck** (`pnpm --filter web typecheck`) — covers helper signatures.
- **Manual visual verification on `/dev/primitives`** — click each demo button and confirm:
  - Paper/ink theming (no red, no shadow, border-rule visible).
  - Serif title.
  - Mono caps eyebrow on error (uppercase, `tracking-[0.14em]`, `text-ink-mute`).
  - Long description visibly truncates via `line-clamp-*`.
  - 4-second auto-dismiss for success, 6-second for error.
- **No new vitest target.** The helper is too thin to test meaningfully without testing Sonner itself; the visual outcome is what matters, which vitest can't see.

## Verification checklist

- `lib/notify.tsx` exports `notify.success` and `notify.error` matching the API shape above.
- `app/layout.tsx` `<Toaster />` updated with `closeButton={false}` and `line-clamp-2` on description className.
- `/dev/primitives` shows four demo buttons that produce the four rendering shapes above.
- `pnpm --filter web typecheck` clean.
- Visual manual verification: each variant renders correctly with no red, no shadow, mono eyebrow on errors, line clamp truncates long descriptions.

## Out of scope

- Migration of existing `setError()` sites (`trial-banner`, `student-picker`, `add-student-form`, `answer-key-upload-form`, etc.). Those move when their owning feature work touches them.
- `info` and `warning` variants. Add later only if a Phase 1 surface demands them.
- Custom toast positions, animations, or stack rules — Sonner defaults are fine.
- Per-action helpers (e.g., `notify.studentAdded(name)`). Defer until N domain callsites benefit.

## Seven-item checklist (handoff doc)

1. Every font size is a token — pass (`text-base`, `text-sm`, `text-xs`).
2. Every color is a token — pass (`text-ink`, `text-ink-soft`, `text-ink-mute`, `bg-paper`, `border-rule`).
3. Visible focus ring on every interactive element — N/A (toasts non-interactive).
4. Amber only at insight moments. Red only on `/error` ERR-XXX eyebrow — pass (no amber introduced; no red anywhere in toast styling).
5. Body text is 18px. Nothing below 15px — note: `text-xs` (12px) is used on the mono eyebrow per the editorial pattern (eyebrows are tracking-wide caps, lower size is the canvas pattern). Body description is `text-sm` (14px) — a deviation from the 15px floor for the secondary toast text. Justification: matches Sonner's compact-toast format and the existing `<Toaster />` config already in `layout.tsx:33` which uses `text-sm` for descriptions. The handoff's 15px floor is for primary content; toasts are ephemeral system feedback and the 14px description size is the established convention here. Flag if you'd like this tightened.
6. Serif = meaning, sans = doing — pass (serif for the title content, sans for description and mono caps eyebrow which is system signal).
7. Matches reference canvas — N/A (handoff doc text-only spec for Step 09, no canvas mock).

## Locked decisions

**Description text stays at `text-sm` (14px).** Confirmed 2026-04-29. The handoff's 15px floor is for primary content; toasts are ephemeral system feedback. Matches the existing `<Toaster />` config from Step 02 (`layout.tsx:33`).
