// Only authoring errors may be sent back to the model for a bounded repair.
// File-system, rendering and connectivity errors must not spend model tokens.
export class DocumentValidationError extends Error {
  constructor(message) { super(message); this.name="DocumentValidationError"; this.repairable=true; }
}
