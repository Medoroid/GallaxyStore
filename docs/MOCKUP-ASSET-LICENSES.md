# Mockup Asset Inventory & Licensing

> Updated 2026-11-17 for the photorealistic mockup replacement.
> Source of licence terms: **https://www.pexels.com/license/** — verified by direct page fetch.
> Pexels Licence: photos and videos may be downloaded and used free for commercial purposes,
> may be modified, and **attribution is not required** (appreciated but optional).
> Prohibited: selling unaltered copies, implying endorsement, redistribution as stock.

All images below were downloaded from the Pexels CDN (`images.pexels.com`) to
`public/mockup-assets/` and are served locally — **no hotlinked external images** appear in the UI.
Each was visually inspected and a printable area was measured from the actual pixels.

## Inventory

| # | Product / view / colour | Local file | Pexels photo ID & page | Author | Licence | Print area (normalised x,y,w,h) |
|---|---|---|---|---|---|---|
| 1 | Classic T-Shirt · front · white | `tshirt/white/front.jpg` | 12025472 — /photo/a-blank-white-shirt-12025472/ | Mr. Mockup | Pexels Licence | 0.34, 0.25, 0.32, 0.58 |
| 2 | Classic T-Shirt · front · black | `tshirt/black/front.jpg` | 8532616 — /photo/a-black-shirt-hanging-on-the-wall-8532616/ | Anna Nekrashevich | Pexels Licence | 0.36, 0.24, 0.29, 0.62 |
| 3 | Oversized T-Shirt · front · white | `oversized_tshirt/white/front.jpg` | 12039633 — /photo/white-t-shirt-on-white-surface-12039633/ | MockupBee | Pexels Licence | 0.36, 0.25, 0.29, 0.60 |
| 4 | Hoodie · front · white | `hoodie/white/front.jpg` | 8217518 — /photo/a-man-in-white-hoodie-standing-8217518/ | Mart Production | Pexels Licence | 0.54, 0.60, 0.26, 0.30 |
| 5 | Sweatshirt · front · white | `sweatshirt/white/front.jpg` | 8217516 — /photo/a-man-in-a-white-sweater-posing-8217516/ | Mart Production | Pexels Licence | 0.33, 0.55, 0.43, 0.35 |
| 6 | Mug · front · white | `mug/white/front.jpg` | 13360742 — /photo/close-up-photo-of-white-ceramic-mug-13360742/ | Blush Pink Studio | Pexels Licence | 0.34, 0.20, 0.34, 0.62 |
| 7 | Phone Case · back · white | `phone_case/white/back.jpg` | 9558938 — /photo/person-holding-white-iphone-5-c-9558938/ | Mart Production | Pexels Licence | 0.43, 0.21, 0.17, 0.55 |
| 8 | Tote Bag · front · natural | `tote_bag/natural/front.jpg` | 9869067 — /photo/plain-tote-bag-9869067/ | Brando Ltd | Pexels Licence | 0.34, 0.33, 0.35, 0.58 |
| 9 | Poster · front · white | `poster/white/front.jpg` | 6373756 — /photo/mock-up-poster-on-wooden-wall-6373756/ | Gabby K | Pexels Licence | 0.35, 0.30, 0.48, 0.42 |
| 10 | Mouse Pad · top · black | `mouse_pad/black/front.jpg` | 27559521 — /photo/a-mouse-and-keyboard-on-a-desk-27559521/ | Mintworkspace | Pexels Licence | 0.27, 0.36, 0.52, 0.31 |
| 11 | Sticker · front · white | `sticker/white/front.jpg` | 8015726 — /photo/a-person-holding-a-white-sticky-note-8015726/ | Cup of Couple | Pexels Licence | 0.36, 0.34, 0.33, 0.12 |

Full source URLs are stored in `lib/mockup-library/photo-assets.ts` (`sourcePage` per asset).

## Notes on source quality
- **Product-only photos** (best for print compositing): classic tee white/black, oversized tee,
  tote bag, mug, phone case, poster, sticker.
- **Model-worn photos** (limited to the clear chest area): hoodie and sweatshirt. Their print
  areas are deliberately conservative so artwork never crosses hands, pockets or the face.
- **Mouse pad** is a real desk photo with the mouse visible; the print area is limited to the
  clear lower-right portion of the pad so artwork does not cover the mouse.
- No PSD layered files were used — none could be verified as commercially licensed in this
  environment. The compositor supplies the editable layers (base photo, print mask, artwork,
  texture) at runtime instead.

## Colour policy
Only the colours listed above have real photographs. The studio **hides other colour options**
rather than recolouring a photo with CSS filters. Adding a colour requires a new licensed photo.

## Former vector assets
The earlier code-authored SVG templates remain in `lib/mockup-library/templates.ts` as the
geometry/validation reference and fallback data model. They are **not presented to customers as
photorealistic mockups** — the studio always uses the photo branch when a photo asset exists.
