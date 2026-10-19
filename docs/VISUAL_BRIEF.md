# Visual Brief

Approved reference: mockup v6 (`.superpowers/brainstorm/1089-1792319084/content/public-site-v6.html`) and the user's videos `references/visual-reference-1.mp4` and `-2.mp4`. Where a design skill's house rules conflict with the user's reference, the reference wins.

## Reference interpretation
- Video 1: dark ink background, large serif headline with one italic champagne word, pill buttons.
- Video 2: drone fly-in to the building, then a scroll-driven walk inside. On the real site this becomes pre-rendered image sequences on a canvas, never `video.currentTime` seeking.

## Themes (tenant configuration)
| Token | Platform default | Manor tenant |
|---|---|---|
| background | warm stone | ink `#0b0405` |
| accent | muted champagne | champagne `#d9bf8c` |
| text | charcoal | ivory `#f4ece0` |
| muted | stone grey | `#b3a597` |
| brand | brass | maroon `#5b0f1a` |

Components read tokens only. No colour or font is hard-coded.

## Typography
- Display: Cormorant Garamond (Manor), italic champagne accent word. Body: Inter.
- Laptop: display 38–88 px, sub-heads 30–52 px, body 17 px. Phone: 34–44, 28–36, 16 px.
- Dashboard uses the same fonts at a denser scale, light surfaces for long work, tenant accent for actions.

## Layout and imagery
- Photos edge to edge with soft masks; no boxed images; no blank screens between sections.
- Full-screen only from sources ≥1600 px; small sources only as gallery tiles.
- Text over photos: layered shadow plus local gradient, never heavy full-screen darkening.
- Responsive size choice by long side × pixel ratio (small ≤1400, medium ≤2200, large).

## Motion
- One scroll system with smoothed progress per pinned section (hero push-in, room crossfades, stage circle reveal, gallery drift, pinned events).
- Optional effects (film grain, gold dust, light leak, letterbox open) switch off for reduced motion and on low-power devices.
- Reduced motion: everything static and readable.
- No scroll jank: transforms and opacity only, images decoded before use.

## 3D approach
Progressive enhancement. MVP uses 2.5D photo motion. A future tour (panorama or GLB of the real venue) loads lazily behind a poster, with WebGL fallback, and is never faked as the real venue.

## Mobile
Phone is the main device for customers. Booking flow is one column, large tap targets, sticky "Reserve" bar, works on 4G with small image variants.
