/* ------------------------------------------------------------------ */
/*  Validation rules for import data                                    */
/* ------------------------------------------------------------------ */

export interface ValidationError {
  row: number;
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface MappedRow {
  [key: string]: unknown;
}

/** Validate a mapped inventory row */
export function validateInventoryRow(
  row: MappedRow,
  rowNumber: number
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required: name
  if (!row.name || String(row.name).trim() === "") {
    errors.push({ row: rowNumber, field: "name", message: "Name is required", severity: "error" });
  }

  // Required: category
  if (!row.category || String(row.category).trim() === "") {
    errors.push({ row: rowNumber, field: "category", message: "Category is required", severity: "error" });
  }

  // Price: must be non-negative number
  if (row.price_cents !== undefined) {
    const price = Number(row.price_cents);
    if (isNaN(price) || price < 0) {
      errors.push({ row: rowNumber, field: "price_cents", message: "Price must be a non-negative number", severity: "error" });
    }
  }

  // Cost: must be non-negative
  if (row.cost_cents !== undefined) {
    const cost = Number(row.cost_cents);
    if (isNaN(cost) || cost < 0) {
      errors.push({ row: rowNumber, field: "cost_cents", message: "Cost must be a non-negative number", severity: "error" });
    }
  }

  // Quantity: must be non-negative integer
  if (row.quantity !== undefined) {
    const qty = Number(row.quantity);
    if (isNaN(qty) || qty < 0 || !Number.isInteger(qty)) {
      errors.push({ row: rowNumber, field: "quantity", message: "Quantity must be a non-negative integer", severity: "error" });
    }
  }

  // TCG condition: if present, must be valid
  const condition = row["attributes.condition"] ?? (row.attributes as Record<string, unknown>)?.condition;
  if (condition) {
    const valid = ["NM", "LP", "MP", "HP", "DMG"];
    if (!valid.includes(String(condition))) {
      errors.push({ row: rowNumber, field: "condition", message: `Invalid condition "${condition}". Expected: ${valid.join(", ")}`, severity: "warning" });
    }
  }

  // Name length
  if (row.name && String(row.name).length > 500) {
    errors.push({ row: rowNumber, field: "name", message: "Name exceeds 500 characters", severity: "warning" });
  }

  return errors;
}

/** Validate a mapped customer row */
export function validateCustomerRow(
  row: MappedRow,
  rowNumber: number
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required: name
  if (!row.name || String(row.name).trim() === "") {
    errors.push({ row: rowNumber, field: "name", message: "Name is required", severity: "error" });
  }

  // Email: basic format check
  if (row.email && typeof row.email === "string" && row.email.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(row.email.trim())) {
      errors.push({ row: rowNumber, field: "email", message: "Invalid email format", severity: "warning" });
    }
  }

  // Credit balance: must be non-negative
  if (row.credit_balance_cents !== undefined) {
    const balance = Number(row.credit_balance_cents);
    if (isNaN(balance) || balance < 0) {
      errors.push({ row: rowNumber, field: "credit_balance_cents", message: "Credit balance must be non-negative", severity: "error" });
    }
  }

  return errors;
}

/** Validate all rows for an entity type */
export function validateRows(
  rows: MappedRow[],
  entityType: "inventory" | "customers"
): { errors: ValidationError[]; errorCount: number; warningCount: number } {
  const validator = entityType === "inventory" ? validateInventoryRow : validateCustomerRow;
  const allErrors: ValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowErrors = validator(rows[i], i + 1);
    allErrors.push(...rowErrors);
  }

  return {
    errors: allErrors,
    errorCount: allErrors.filter((e) => e.severity === "error").length,
    warningCount: allErrors.filter((e) => e.severity === "warning").length,
  };
}
