import type { ModerationCategory } from "./types";

export interface ModerationFinding {
  category: ModerationCategory;
  matched: string;
}

export interface ContentModerator {
  readonly id: string;
  moderate(text: string): Promise<ModerationFinding[]>;
}

const DEFAULT_KEYWORDS: Record<ModerationCategory, string[]> = {
  hate: ["hate speech", "racial slur", "racist", "anti-semitic", "bigot"],
  harassment: ["harass", "bully", "dox", "threaten"],
  violence: ["kill them", "bomb", "violence", "beat up", "murder"],
  sexual: ["explicit sexual", "porn", "nsfw", "sexual content"],
  self_harm: ["suicide", "self harm", "cut myself", "kill myself"],
  spam: ["free money", "click here", "lottery winner", "act now"],
  harmful: ["illegal drugs", "weapon instructions", "exploit code"],
};

export class KeywordModerator implements ContentModerator {
  readonly id = "keyword";

  constructor(private keywords: Record<ModerationCategory, string[]> = DEFAULT_KEYWORDS) {}

  async moderate(text: string): Promise<ModerationFinding[]> {
    const lower = text.toLowerCase();
    const findings: ModerationFinding[] = [];
    for (const [category, terms] of Object.entries(this.keywords) as [ModerationCategory, string[]][]) {
      for (const term of terms) {
        if (lower.includes(term.toLowerCase())) {
          findings.push({ category, matched: term });
        }
      }
    }
    return findings;
  }
}
