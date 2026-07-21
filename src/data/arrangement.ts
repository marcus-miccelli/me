/**
 * The about page arrangement: Marcus's life laid out as a session file —
 * four tracks of clips on a real time ruler, with his story eras as
 * locator markers. Clips reference cv.ts entries/bullets by id so the CV
 * data stays the single source of facts; locators reference story.ts eras.
 *
 * Times are decimal years (2021.25 ≈ apr 2021). Spans are approximate
 * where the CV gives no dates (WIP projects run past `RULER.end` visually
 * by clamping).
 *
 * Same anti-scraper rule as cv.ts: no contact details in this module.
 */

export type TrackId = "education" | "work" | "projects" | "play";

export type Clip = {
  id: string;
  /** Category — drives the clip's colour and the clip-view tag. */
  track: TrackId;
  /** Which track row of that category the clip sits on (0 = first). */
  lane: number;
  /** Full name — clip view title + tooltip. */
  label: string;
  /** Short name for the clip strip; falls back to label. */
  short?: string;
  from: number;
  to: number;
  /** Still running — rendered with an open (faded) right edge. */
  ongoing?: true;
  /** cv.ts bullets shown in the clip view, in order. */
  bulletIds?: string[];
  /** Right-hand column string from the cv entry (dates or tech). */
  meta?: string;
};

export type Locator = {
  /** Must resolve to a story.ts era. */
  eraId: string;
  at: number;
};

/** View starts at 2016 — earlier childhood years are summarised by the
 * clamped first clip rather than stretching the ruler with empty years. */
export const RULER = { start: 2016, end: 2027.5 };

/** One header per row, Live-style: a category that needs two stacked
 * clips gets two numbered tracks rather than one double-height lane, so
 * every header lines up with exactly one row of clips. */
export type Track = {
  id: string;
  track: TrackId;
  lane: number;
  name: string;
  /** Mixer pose for the header strip — decorative. Fader value in dB. */
  db: number;
  /** −1 (hard left) … 1 (hard right); 0 reads as centre. */
  pan: number;
  /** Record-armed — one track only, like a session you left running. */
  armed?: true;
};

export const TRACKS: Track[] = [
  {
    id: "education",
    track: "education",
    lane: 0,
    name: "education",
    db: 0,
    pan: 0,
  },
  { id: "work", track: "work", lane: 0, name: "work", db: -1.5, pan: -0.15 },
  {
    id: "projects-1",
    track: "projects",
    lane: 0,
    name: "projects 1",
    db: -3,
    pan: 0.22,
  },
  {
    id: "projects-2",
    track: "projects",
    lane: 1,
    name: "projects 2",
    db: -4.5,
    pan: -0.3,
    armed: true,
  },
  { id: "play-1", track: "play", lane: 0, name: "play 1", db: -6, pan: 0.35 },
  { id: "play-2", track: "play", lane: 1, name: "play 2", db: -8.5, pan: -0.4 },
];

export const CLIPS: Clip[] = [
  {
    id: "clip-certiv",
    short: "cert iv + msft",
    track: "education",
    lane: 0,
    label: "cert iv (networking) + microsoft traineeship",
    from: 2021.33,
    to: 2022.58,
    meta: "May 2021 – Aug 2022",
    bulletIds: ["edu-accm-recognition", "edu-msft-certs"],
  },
  {
    id: "clip-monash",
    short: "monash — bcompsci",
    track: "education",
    lane: 0,
    label: "monash — bcompsci (advanced), maths major",
    from: 2023.08,
    to: 2026.92,
    meta: "Feb 2023 – Dec 2026",
    bulletIds: [
      "edu-monash-wam",
      "edu-monash-units",
      "edu-monash-future",
      "edu-monash-award",
    ],
  },
  {
    id: "clip-natit",
    short: "national it solutions",
    track: "work",
    lane: 0,
    label: "national it solutions — it technician",
    from: 2021.33,
    to: 2022.92,
    meta: "May 2021 – Dec 2022",
    bulletIds: [
      "exp-natit-m365",
      "exp-natit-intune",
      "exp-natit-onprem",
      "exp-natit-licensing",
    ],
  },
  {
    id: "clip-jetstar",
    short: "jetstar",
    track: "work",
    lane: 0,
    label: "jetstar — backend developer (intern)",
    from: 2025.0,
    to: 2025.45,
    meta: "Jan 2025 – Jun 2025",
    bulletIds: [
      "exp-jetstar-sonar",
      "exp-jetstar-veracode",
      "exp-jetstar-fullstack",
    ],
  },
  {
    id: "clip-mineplex",
    short: "mineplex",
    track: "projects",
    lane: 0,
    label: "open source — mineplex + dark islands",
    from: 2024.0,
    to: 2024.9,
    meta: "Java, Shell",
    bulletIds: ["proj-oss-mineplex"],
  },
  {
    id: "clip-quicknote",
    short: "quicknote",
    ongoing: true,
    track: "projects",
    lane: 0,
    label: "quicknote (wip)",
    from: 2026.0,
    to: 2027.5,
    meta: "C, Win32, Claude Code",
    bulletIds: ["proj-quicknote-main"],
  },
  {
    id: "clip-lobby",
    short: "lobby",
    track: "projects",
    lane: 1,
    label: "lobby — macathon, 3rd place",
    from: 2026.15,
    to: 2026.45,
    meta: "Svelte, TypeScript, Supabase",
    bulletIds: ["proj-lobby-macathon"],
  },
  {
    id: "clip-portfolio",
    short: "this site",
    ongoing: true,
    track: "projects",
    lane: 1,
    label: "this site (wip)",
    from: 2026.5,
    to: 2027.5,
    meta: "React, TypeScript, R3F",
    bulletIds: ["proj-portfolio-main"],
  },
  {
    id: "clip-minecraft",
    short: "minecraft · pc · sport",
    track: "play",
    lane: 0,
    label: "minecraft servers · first pc · sport · design",
    from: 2016.0,
    to: 2019.9,
    meta: "self-taught · running since 2011",
  },
  {
    id: "clip-beats",
    short: "ableton — 1000+ beats",
    ongoing: true,
    track: "play",
    lane: 0,
    label: "ableton — 1000+ beats",
    from: 2020.0,
    to: 2027.5,
    meta: "ongoing",
  },
  {
    id: "clip-markets",
    short: "markets · poker",
    ongoing: true,
    track: "play",
    lane: 1,
    label: "markets · tournament poker",
    from: 2020.0,
    to: 2027.5,
    meta: "since 2020 · ongoing",
  },
];

export const LOCATORS: Locator[] = [
  { eraId: "explorer", at: 2016.0 },
  { eraId: "refusal", at: 2020.0 },
  { eraId: "trade", at: 2021.33 },
  { eraId: "rebuild", at: 2023.08 },
  { eraId: "edge", at: 2026.5 },
];
