export type HomepageContent = {
  hero_image_path: string;
  hero_alt: string;
  hero_kicker: string;
  hero_title: string;
  hero_accent: string;
  hero_suffix: string;
  hero_description: string;
  drop_label: string;
  drop_title: string;
  drop_accent: string;
  drop_description: string;
  story_image_path: string;
  story_alt: string;
  story_label: string;
  story_title: string;
  story_accent: string;
};

export const defaultHomepageContent: HomepageContent = {
  hero_image_path: "/brand/HeroBanner.png",
  hero_alt: "Matte-black road bike brake hoods on a dark studio set",
  hero_kicker: "Drop 03 / Contact points",
  hero_title: "Make the",
  hero_accent: "cockpit",
  hero_suffix: "yours.",
  hero_description: "Small parts change the whole build. Find the grip, color, and hardware that reads like you.",
  drop_label: "Current hardware",
  drop_title: "The",
  drop_accent: "drop.",
  drop_description: "Selected components for the current release.",
  story_image_path: "/manus-storage/underrated-cockpit_6568441b.jpg",
  story_alt: "Graphite road bike cockpit with wrapped bars and stem",
  story_label: "The new cockpit / 01",
  story_title: "Made to",
  story_accent: "be noticed.",
};
