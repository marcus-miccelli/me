/**
 * The about page copy. Copy policy: every sentence must be Marcus's own
 * words, verbatim from his LinkedIn post (D:\Desktop\linkedin.txt) —
 * original casing preserved. Anything not yet written by him is a
 * "[ placeholder — ... ]" string for him to fill in.
 *
 * Receipts reference cv.ts bullets by id so the CV data stays the single
 * source of facts.
 *
 * Same anti-scraper rule as cv.ts: no contact details in this module.
 */

export type Receipt = {
  /** Must resolve to a cv.ts bullet that has marginalia (`more`). */
  bulletId: string;
  /** Short chip label. */
  label: string;
};

export type Era = {
  id: string;
  years: string;
  title: string;
  body: string[];
  /** One line set large after the body, if the era earned it. */
  pull?: string;
  receipts?: Receipt[];
};

export const HERO = {
  quote: "a test of who I really was, not just who I thought myself to be.",
};

export const ERAS: Era[] = [
  {
    id: "explorer",
    years: "–2019",
    title: "The Explorer",
    body: [
      "[ placeholder — the explorer: minecraft server at 10, first computer at 14, clarinet + sports, graphic design, finishing school without methods or specialist maths ]",
      "To me this was a proper education.",
    ],
  },
  {
    id: "refusal",
    years: "2020",
    title: "The Refusal",
    body: [
      "[ placeholder — the refusal: monash offer, unenrolling, covid, ableton, markets, poker, warzone ]",
    ],
    pull: "[ placeholder — pull line ]",
  },
  {
    id: "trade",
    years: "2021–22",
    title: "The Trade",
    body: [
      "[ placeholder — the trade: microsoft traineeship, cert iv at the msp, powershell scripting, realising which part of the week you loved, quitting ]",
    ],
    receipts: [{ bulletId: "exp-natit-licensing", label: "The MSP years" }],
  },
  {
    id: "rebuild",
    years: "2023–26",
    title: "The Rebuild",
    body: [
      "[ placeholder — the rebuild: it at monash, transfer into cs, discovering quant, data science minor → maths major ]",
      "I wanted to do something hard.",
    ],
    pull: "In this journey I have struggled, and I still am, and I am proud of that.",
    receipts: [
      { bulletId: "edu-monash-units", label: "What actually stuck" },
      { bulletId: "exp-jetstar-sonar", label: "How the pipeline worked" },
      {
        bulletId: "proj-oss-mineplex",
        label: "240,000 lines of other people's Java",
      },
      { bulletId: "proj-lobby-macathon", label: "72 hours to third place" },
    ],
  },
  {
    id: "edge",
    years: "Now",
    title: "The Edge",
    body: [
      "[ placeholder — the edge: graduating end of 2026, final-round quant interviews, music production as balance, what you want to build next ]",
    ],
    receipts: [
      { bulletId: "edu-monash-future", label: "The quant trajectory" },
      { bulletId: "proj-quicknote-main", label: "Why C and Win32 in 2026" },
      { bulletId: "proj-portfolio-main", label: "This site" },
    ],
  },
];

export const OBJECTIVES: { key: string; text: string }[] = [
  {
    key: "Software Engineering",
    text: "[ placeholder ]",
  },
  {
    key: "Research",
    text: "[ placeholder ]",
  },
  {
    key: "AI + ML",
    text: "[ placeholder ]",
  },
  {
    key: "Augmented Reality",
    text: "[ placeholder ]",
  },
  {
    key: "Human-Centred Computing",
    text: "[ placeholder ]",
  },
];

export const SIGNOFF = "[ placeholder — signoff ]";
