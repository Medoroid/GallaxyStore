# Theme Studio — Admin Guide

Galaxy Store's seasonal theming system: create, schedule, preview, publish
and roll back store themes — **without touching code**. This guide covers the
operator workflow; the engineering plan lives in `docs/THEME-SYSTEM-PLAN.md`.

---

## 1. What you can change

A theme is a validated configuration (never raw CSS/JS) with five sections:

| Section    | What it controls                                                            |
| ---------- | --------------------------------------------------------------------------- |
| Colors     | Brand, background, surface, text, accent, sale, chart tokens                |
| Typography | Heading/body font (whitelisted), weights, sizes, spacing, line heights      |
| Components | Radii, shadows, button/inputs/card styling knobs                           |
| Decorations| Seasonal overlay: snowflakes, sparkles, lanterns, crescent, ribbons, gradient, corner ornaments — each toggleable, with density Light/Medium/Heavy |
| Assets     | Seasonal banner (title/subtitle/link/images), announcement bar text, background images |

Everything is emitted as CSS variables (`:root { --brand: … }`) on top of the
existing design system, so the store keeps its current look with any theme —
and with **no theme published (built-in default)** the storefront is
pixel-identical to today's `globals.css`.

## 2. Where to find it

**Admin → Theme Studio** (`/admin/theme-studio`).

- **Create** — name a theme, optionally start from one of 8 presets:
  Ramadan, Eid al-Fitr, Eid al-Adha, Christmas, Valentine's Day, Halloween,
  Black Friday, New Year. A preset is a starting point: it merges over the
  default config and the result is a normal draft you can edit freely.
- **Theme list** — status, priority, activation mode, live conflicts, and a
  preview of which theme the storefront would pick right now.
- **Quick actions** — activate/archive, *Set as default*, *Manual override*,
  *Clear override*, delete.

## 3. Editing a theme (8 tabs)

| Tab          | Contents                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| Colors       | Full palette + sale/accent tokens                                        |
| Typography   | Fonts (whitelisted), weights, sizes                                      |
| Components   | Radii, shadows, button/card styling                                      |
| Decorations  | Master switch + 7 effect toggles + density                               |
| Assets       | Banner text/links/URLs, announcement bar text, file uploads              |
| Schedule     | Status, activation mode, window, timezone, recurrence, priority          |
| Preview      | Live iframe of the real storefront with your **unsaved** draft           |
| Versions     | Snapshot, Publish, Restore                                               |

**Validation:** the editor runs the same validator the API uses. Errors block
Save, and the preview always shows the last *valid* configuration — typing
never blanks the canvas. Nothing invalid can ever be stored.

**Save** persists the draft. **Publish** (Versions tab) snapshots the current
state, then makes the theme live (`active`, or `scheduled` when a window is
set). Publishing only makes a theme *eligible* — the resolution order below
still decides what visitors see.

## 4. Live preview

Open the **Preview** tab. The iframe runs the real storefront at
`/?preview=1` with your draft applied:

- Colors, typography, components → full token overrides (what Save would ship)
- Seasonal banner → shown in its real position on the homepage, with the draft
- Decorations → the draft overlay only (the storefront's own layer hides)
- An amber **PREVIEW** badge is always visible; visitors never see any of it

Mechanics: the draft travels via `localStorage` + `postMessage` (same origin,
no cookies). The draft is validated in the browser before it is applied, and
**only applies on `?preview=1`** — normal visitors never activate the bridge.

*Known limitation:* the top announcement bar renders server-side from the
saved theme, so a draft's announcement text is not previewed (everything else
is). "Open in new tab" shows the last draft in a fresh tab.

## 5. Scheduling & resolution

**Activation modes**

- `manual` — status only (`active` / `archived`); window fields are ignored.
- `scheduled` — eligible only inside `starts_at … ends_at`, interpreted in
  the theme's IANA timezone. `is_recurring` makes the window repeat **every
  year** (handles Dec→Jan spans). Times are stored as UTC ISO.

**Resolution order (exactly what the storefront applies):**

1. **Manual override** — the pinned theme, always wins (emergency pin)
2. Highest-**priority** theme whose window contains *now* (ties → most
   recently updated)
3. The configured **default theme**
4. **Built-in default** — no style tag at all; today's design, unchanged

The studio list shows conflicts (two themes eligible at the same priority)
and the currently resolved winner before you publish anything.

**Priority range:** −1000 … 1000. Higher wins.

## 6. Versions, publish, restore

- **Snapshot** — save a named point-in-time copy without changing status.
- **Publish** — snapshot + move to live status in one deliberate action.
- **Restore** — copies an old snapshot back onto the theme and appends a
  **new** version, so a restore is itself undoable. The full timeline is in
  the theme's schedule history and the admin audit log.

**Emergency "Restore Default" (built-in look):**

1. *Clear override* (list page), then
2. *Set as default* → none (or archive the active themes).

With no override, no eligible window and no default, the store falls back to
the built-in design within the cache window below.

## 7. Assets & uploads

Uploads go to the public `theme-assets` bucket (images only, 5 MB max,
`{theme_id}/{uuid}.{ext}`). **Use in theme** writes the URL into the matching
field (banner/background) — no copy/paste. Deleting a file makes its URL stop
working immediately, so only remove assets no theme references.

## 8. Decorations & performance

- Hard caps: density Light/Medium/Heavy = 6/12/18 elements per kind
  (lanterns ≤ 8, ribbons ≤ 10) — the overlay stays cheap.
- Everything is `pointer-events: none`, `aria-hidden`, and freezes under
  `prefers-reduced-motion`.
- Colors come only from theme tokens; there is no custom CSS channel.

## 9. Going live — propagation timing

| Layer                                    | Delay                                |
| ---------------------------------------- | ------------------------------------ |
| Server theme resolution                  | ≤ 30 s (in-memory cache)             |
| `/api/theme` CDN cache                   | 60 s (+ stale-while-revalidate 300)  |
| Root layout (style tag, bar, decorations)| ≤ 5 min (`revalidate = 300`)         |

Worst case: a publish is visible everywhere within **~5 minutes**. Preview
tab edits are instant (client-side only) but require Save + Publish to ship.

**Announcement bar precedence:** a theme's `assets.announcement` replaces the
store-wide `settings.announcement` while set; clear the theme text to fall
back to the store setting.

## 10. Before the migration is applied

The theme tables come from
`supabase/migrations/20261110100000_theme_management.sql` (not yet applied to
production). Until then:

- The storefront runs the built-in default — unchanged, no errors.
- Theme Studio API calls return `503 THEME_MIGRATION_REQUIRED` and the
  dashboard shows an honest *"Database upgrade required"* panel naming the
  migration file. Nothing pretends to work.

## 11. Troubleshooting

| Symptom                                             | Cause / fix                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| Studio shows "Database upgrade required"            | Apply `20261110100000_theme_management.sql`, then reload           |
| Theme saved but store unchanged                     | Not published, window closed, or lower priority — check the list's *resolved* preview; worst-case 5 min layout revalidate |
| Preview tab blank                                   | Draft failed validation — fix the reported errors                   |
| Banner not showing                                  | `bannerEnabled` off, or no title/subtitle/image set                 |
| Decorations missing                                 | Master switch off, density off, or visitor has reduced-motion on    |
| Two themes fighting                                  | Conflict badge in the list — raise one priority or close a window   |
