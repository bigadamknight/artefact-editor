# BP "Don't Drop Data in AI Chat" — Design

## Style Prompt

Editorial, authoritative, punchy. Stylistic sibling to the TSAPI promo but with a sharper opening — a white-canvas poster callback in scene 1 (massive black type, like the source poster), then shifts to dark-canvas editorial for the argument and correct-approach sections. Single mint-teal accent for emphasis. Kinetic typography, measured cadence, nothing decorative. Underscored by sparse ambient bed.

## Colors

- `#0B0B0F` — Canvas dark (scenes 2+)
- `#FAFAF7` — Canvas light (scene 1 hook, scene 6 CTA)
- `#121216` — Primary text on light canvas
- `#FAFAF7` — Primary text on dark canvas
- `#9AA3B2` — Secondary on dark
- `#2DD4BF` — Accent (emphasis, CTA)
- `#EF4444` — Warning accent ("wrong", "No.")

## Typography

- Display: Inter 800, letter-spacing -0.045em
- Body: Inter 500-600
- CTA URL: Inter 800

## Motion

- Primary transition: blur crossfade 0.5s
- White → dark transition at T1 uses a brief flash/dip
- Text entrance: fitted y/opacity, vary ease per scene

## What NOT to Do

- No playful easing, no drop shadows, no emoji
- No full-screen gradients
- Body text must stay readable at mobile size (≥24px)
