/**
 * Core module: workspace — diff-specific error family (PRD §4.2).
 *
 * Extends the workspace error hierarchy with policy-level validation
 * failures for diff size limits.
 */

import { WorkspaceError } from "./workspace-errors.js";

export class DiffSizePolicyError extends WorkspaceError {
  constructor(message: string) {
    super(message);
    this.name = "DiffSizePolicyError";
  }
}
