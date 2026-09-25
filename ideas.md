# Underrated Cycling Co. — Design Direction

## Reference Ground Truth

The supplied Underrated Cycling Co. social imagery is the visual ground truth. This storefront must translate its **high-contrast product-editorial language** into a purchase-ready website: matte black environments, architectural crop lines, enormous condensed text, sharp white marks, vivid signal orange and occasional electric blue, glossy technical-product surfaces, and an energetic independent-cycling attitude. Fidelity to this reference outweighs generic ecommerce conventions.

## Chosen Approach — Technical Drop Editorial

### Design Movement

Contemporary sport-editorial design with the restraint of technical product catalogues and the force of underground race-poster typography.

### Core Principles

1. **Product as artifact:** parts appear like collectible industrial objects, framed by deep shadow and precise specifications.
2. **Rhythm over symmetry:** the page uses offset grids, cropped images, interrupted rules, and oversized type rather than centered marketing blocks.
3. **Signal hierarchy:** off-white carries essential information; signal orange marks action and urgency; blue is reserved for select technical moments.
4. **Fast tactile feedback:** controls respond with crisp 120–220ms motion, firm active states, and no ornamental animation.

### Color Philosophy

Near-black is the gallery floor that gives parts weight and lets reflective surfaces read. Warm bone white feels printed rather than digitally sterile. Signal orange delivers release-day urgency without becoming a gradient, while a controlled cobalt blue suggests precision engineering. The palette is intentionally sparse so every colored moment feels authored.

### Layout Paradigm

An **editorial launch sheet**, built from a twelve-column field that regularly breaks its own alignment. The hero is an asymmetric two-act frame, product cards use varied vertical emphasis, and large horizontal wordmarks create hard stops between content sequences. Avoid conventional centered sections and uniformly rounded card grids.

### Signature Elements

- A compact linked **UC** symbol created from two interlocking angled strokes.
- Oversized italic headline words that bleed or crop at section edges.
- Fine technical rules, product index numbers, and small uppercase spec labels.

### Interaction Philosophy

The interaction model should feel like handling workshop equipment: deliberate, immediate, and legible. Product cards zoom only slightly on hover; quick actions appear as compact printed labels; cart and menu panels move in like a sliding equipment drawer. Keyboard navigation must remain direct and visible.

### Animation

Use a sharp ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`) for entry and exit. Hover and pressed states sit within 120–180ms; panels can use 240–320ms. Stagger featured products by 45ms at load only. Animate opacity and transform, never layout dimensions. All nonessential animation pauses under reduced-motion settings.

### Typography System

- **Display:** `Barlow Condensed`, 700–900, all caps, with italic styling for campaign messages and launch calls.
- **Body/system:** `DM Sans`, 400–700, for specifications, navigation, pricing, and product copy.
- **Hierarchy:** massive 72–160px display lines on desktop; compact 10–12px tracked labels; 15–17px highly legible product body copy. No generic neutral-sans-only look.

### Brand Essence

**Underrated Cycling Co. makes expressive, detail-obsessed parts for riders who want the build to say something.**

Personality: **defiant, precise, collectible**.

### Brand Voice

The voice is direct, short, and product-first—never inflated, sentimental, or generic. Headlines sound like a release notice; CTAs sound like an invitation to build.

- “Make the cockpit yours.”
- “Details are the difference.”

### Wordmark & Logo

The wordmark combines a compressed italic **UNDERRATED** with an ultra-small **CYCLING CO.** support line. The standalone logo is an interlocked `U`/`C` stroke mark: two rounded, offset angular forms that echo a brake hood silhouette. Use the mark in the header, cart drawer, footer, and favicon at a clearly visible scale.

### Signature Brand Color

**Signal Tangerine — `#FF5A36`**. This is the brand’s decisive action color and should only be used where attention is intentional.

## Style Decisions

- Treat the supplied social posts as editorial reference texture, not product documentation.
- Maintain strong light-on-dark text contrast over every visual crop with hard overlays when necessary.
- Favor near-square corners, hairline borders, cropped type, and visible grid seams over soft cards, pills, gradients, or glass effects.
- Every implementation file must state this design direction in its leading comment before UI code.
- No visible prototype, demo, placeholder, or policy-filler language may appear; utility notes must retain the brand’s short, product-first voice.
- The UC mark and compressed UNDERRATED wordmark should appear at a confident, stamped-equipment scale in global brand moments.
- Commerce layouts retain clear purchase actions while using numbered fields, cropped display type, varied object framing, and fine technical rules to avoid standard ecommerce symmetry.
- Product indices use deliberate changes in crop scale, vertical rhythm, and marked object numbering rather than a uniform card wall.
- The UC mark and UNDERRATED lockup repeat as an equipment stamp across product framing and purchase moments, not only in global navigation.
