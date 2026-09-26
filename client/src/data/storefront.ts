export type HomepageSectionId = "hero" | "drop" | "story" | "journal";

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
  journal_label: string;
  journal_title: string;
  journal_accent: string;
  journal_description: string;
  journal_post_one_image_path: string;
  journal_post_one_label: string;
  journal_post_one_place: string;
  journal_post_two_image_path: string;
  journal_post_two_label: string;
  journal_post_two_place: string;
  journal_post_three_image_path: string;
  journal_post_three_label: string;
  journal_post_three_place: string;
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
  journal_label: "Visual journal",
  journal_title: "Notes from the",
  journal_accent: "bench.",
  journal_description: "The supplied social work sets the visual direction: bold parts, tough shadows, no apologies.",
  journal_post_one_image_path: "/manus-storage/underrated-reference-profile_080efc99.png",
  journal_post_one_label: "From the bench",
  journal_post_one_place: "Studio notes",
  journal_post_two_image_path: "/manus-storage/underrated-reference-grid-1_ab5c0361.png",
  journal_post_two_label: "Release archive",
  journal_post_two_place: "Hoods / caps / color",
  journal_post_three_image_path: "/manus-storage/underrated-reference-grid-2_92e5ffa0.png",
  journal_post_three_label: "Built to show",
  journal_post_three_place: "Details in the dark",
};
