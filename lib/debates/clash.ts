/** Instant opening, then a 48-hour rebuttal and Q&A window. */

export const OPENING_CHAR_LIMIT = 1000;
export const REBUTTAL_WINDOW_MS = 48 * 60 * 60 * 1000;
export const REBUTTAL_WINDOW_LABEL = "48 hours";

export const CLASH_STAGES = ["opening", "rebuttal", "closed"] as const;
export type ClashStage = (typeof CLASH_STAGES)[number];
