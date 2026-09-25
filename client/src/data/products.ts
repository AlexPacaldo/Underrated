/**
 * Design direction: Technical Drop Editorial — sparse product data for a dark, high-contrast cycling storefront.
 */
export type Product = {
  id: string;
  slug: string;
  name: string;
  category: "Hoods" | "Valve Caps" | "Cockpit" | "Saddles" | "Accessories";
  price: number;
  badge?: string;
  descriptor: string;
  description: string;
  finishes: string[];
  image?: string;
  visual: "hoods" | "valve" | "saddle" | "tape" | "stem" | "stand";
  specs: { label: string; value: string }[];
  fitment: {
    headline: string;
    compatibility: string[];
    checkBeforeRide: string;
  };
  featured?: boolean;
};

export const products: Product[] = [
  {
    id: "stealth-hoods",
    slug: "stealth-hoods",
    name: "Stealth Hoods",
    category: "Hoods",
    price: 64,
    badge: "New drop",
    descriptor: "Variation without compromise.",
    description: "A sculpted grip profile for the riders who tune every touchpoint. Built to feel planted in the sprint and quiet on the long way home.",
    finishes: ["Graphite", "Iced White", "Deep Blue"],
    visual: "hoods",
    specs: [
      { label: "Fit", value: "Road STI" },
      { label: "Material", value: "High-grip elastomer" },
      { label: "Weight", value: "118 g / pair" },
    ],
    fitment: {
      headline: "Built around road STI profiles.",
      compatibility: ["Road STI lever bodies", "Pairs with standard bar tape wraps", "Use as a matched left/right pair"],
      checkBeforeRide: "Confirm your lever-body shape and current hood dimensions before removing the original pair.",
    },
    featured: true,
  },
  {
    id: "rocket-valve-cap",
    slug: "rocket-valve-cap",
    name: "Rocket Valve Cap",
    category: "Valve Caps",
    price: 18,
    badge: "Limited run",
    descriptor: "Small part. Loud signal.",
    description: "A pocket-sized detail with a machined finish and enough color to change the whole build. Sold as a pair.",
    finishes: ["Signal Tangerine", "Iced White", "Deep Blue"],
    image: "/manus-storage/underrated-valvecap_f8df5399.jpg",
    visual: "valve",
    specs: [
      { label: "Fit", value: "Presta valves" },
      { label: "Material", value: "Anodized alloy" },
      { label: "Included", value: "2 caps" },
    ],
    fitment: {
      headline: "Made for Presta valve stems.",
      compatibility: ["Road and track tubes with Presta valves", "Tubeless valves with standard Presta threads", "Sold as a matching pair"],
      checkBeforeRide: "Check that your valve core and extender leave enough exposed thread for a secure hand-tight fit.",
    },
    featured: true,
  },
  {
    id: "iced-saddle",
    slug: "iced-saddle",
    name: "Iced Saddle",
    category: "Saddles",
    price: 112,
    descriptor: "A clean break from the expected.",
    description: "A narrow-profile saddle shaped for quick position changes, finished in an ice-white composite surface that turns a build into a statement.",
    finishes: ["Iced White", "Graphite"],
    image: "/manus-storage/underrated-saddle_50233c3e.jpg",
    visual: "saddle",
    specs: [
      { label: "Width", value: "143 mm" },
      { label: "Rails", value: "Chromoly" },
      { label: "Weight", value: "244 g" },
    ],
    fitment: {
      headline: "A 143 mm profile with standard round rails.",
      compatibility: ["Seatposts designed for round rails", "Road, track, and gravel build positions", "Works with conventional two-bolt clamps"],
      checkBeforeRide: "Confirm rail-clamp compatibility and observe your seatpost’s recommended torque before final adjustment.",
    },
    featured: true,
  },
  {
    id: "deep-blue-tape",
    slug: "deep-blue-tape",
    name: "Deep Blue Tape",
    category: "Cockpit",
    price: 32,
    descriptor: "Hold the line.",
    description: "Cushioned tape with a tightly controlled wrap texture, made to pull a cockpit together without swallowing the detail.",
    finishes: ["Deep Blue", "Graphite", "Iced White"],
    visual: "tape",
    specs: [
      { label: "Length", value: "2 × 220 cm" },
      { label: "Thickness", value: "2.5 mm" },
      { label: "Finish", value: "Microtexture" },
    ],
    fitment: {
      headline: "Cut and wrap for any drop-bar cockpit.",
      compatibility: ["Standard road and gravel drop bars", "Pairs with most road STI hoods", "Enough length for a full two-side wrap"],
      checkBeforeRide: "Measure your current wrap and leave a little excess before trimming the final bar-end finish.",
    },
    featured: true,
  },
  {
    id: "covert-stem",
    slug: "covert-stem",
    name: "Covert Stem",
    category: "Cockpit",
    price: 78,
    descriptor: "No wasted surface.",
    description: "A compact forged alloy stem with a low visual profile and an unapologetically dark finish.",
    finishes: ["Graphite"],
    visual: "stem",
    specs: [
      { label: "Clamp", value: "31.8 mm" },
      { label: "Rise", value: "−7°" },
      { label: "Lengths", value: "90 / 100 / 110 mm" },
    ],
    fitment: {
      headline: "Made for a 31.8 mm bar and 1⅛ in steerer.",
      compatibility: ["31.8 mm road or gravel handlebars", "1⅛ in threadless steerers", "Available in three reach lengths"],
      checkBeforeRide: "Confirm handlebar clamp size, steerer diameter, and cable clearance before you commit to a length.",
    },
  },
  {
    id: "display-stand",
    slug: "display-stand",
    name: "Trophy Display Stand",
    category: "Accessories",
    price: 46,
    badge: "Workshop pick",
    descriptor: "Park it with intention.",
    description: "A compact display piece for the build that refuses to hide in a corner between rides.",
    finishes: ["Graphite", "Signal Tangerine"],
    visual: "stand",
    specs: [
      { label: "Fit", value: "Road + track" },
      { label: "Base", value: "Non-marking rubber" },
      { label: "Use", value: "Display / storage" },
    ],
    fitment: {
      headline: "A display rest for road and track builds.",
      compatibility: ["Road and track wheel profiles", "Clean indoor floors and studio setups", "Non-marking rubber contact point"],
      checkBeforeRide: "Use the stand only on a level surface and confirm the wheel sits fully in the support channel.",
    },
  },
];

export const categories = [
  { name: "Cockpit", index: "01", note: "Tape · Stems · Control" },
  { name: "Hoods", index: "02", note: "Grip · Shape · Signal" },
  { name: "Valve Caps", index: "03", note: "Small parts · Big read" },
  { name: "Saddles", index: "04", note: "Contact · Profile · Pace" },
];

export const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
