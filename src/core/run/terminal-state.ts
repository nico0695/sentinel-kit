/**
 * Core module: run — terminal state model (PRD §4.6, §9 glossary).
 *
 * Every run ends in exactly one of these five domain states. This union is a
 * RUN-domain type, assigned downstream by the verdict parser (E4.F1.H2) and
 * the runReview flow (E4.F1.H1). It is deliberately NOT part of the
 * ReviewEngine return type (dec-004 / Q2): the engine yields raw output; the
 * run domain decides the terminal state.
 */
export type TerminalState =
  | "ok"
  | "ambiguous"
  | "engine-error"
  | "timeout"
  | "validation-failed";
