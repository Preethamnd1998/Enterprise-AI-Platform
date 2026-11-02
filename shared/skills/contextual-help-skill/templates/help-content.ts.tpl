/** Contextual Help content model and copy for __SCREEN__. */
export interface __Pascal__HelpSection {
  title: string;
  about: string;
  howTo: string[];
  fields: { name: string; description: string }[];
  rules: string[];
  examples: string[];
  notes: string[];
  faqs: { q: string; a: string }[];
}

export type __Pascal__HelpTab = __KEYS__;

// One const per key. Copy rules: reference/content-authoring-guide.md. Use [] for empty sections.
const __KEY_CONST__: __Pascal__HelpSection = {
  title: "<Tab or screen name>",
  about:
    "<What it controls/shows> — <for whom> — <scoped by what>. " +
    "<Key precedence / dependency rule in one sentence.>",
  howTo: [
    "<Imperative step using exact on-screen labels.>",
    "<Next step; mention consequence when non-obvious.>",
  ],
  fields: [
    { name: "<Exact field/column label (Role)>", description: "<Meaning + dependency or side-effect.>" },
  ],
  rules: [
    "<Enforced rule, present tense, verifiable in code.>",
  ],
  examples: [
    "<Concrete scenario with names and the resulting effect.>",
  ],
  notes: [
    "<Gotcha that causes tickets: read-only state, destructive action, automatic refresh.>",
  ],
  faqs: [
    { q: "Why can't I <do X>?", a: "<Direct answer, then remedy.>" },
    { q: "I <did Y> but <Z not visible> — why?", a: "<Direct answer, then remedy.>" },
    { q: "Can I undo <action>?", a: "<Yes/No, then how.>" },
  ],
};

export const __PREFIX_UPPER___HELP_CONTENT: Record<__Pascal__HelpTab, __Pascal__HelpSection> = {
  __DEFAULT_KEY__: __KEY_CONST__,
};
