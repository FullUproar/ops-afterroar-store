/* ------------------------------------------------------------------ */
/*  File Parser — CSV, XLSX, TSV                                        */
/*  Normalizes any tabular format into headers + rows.                  */
/* ------------------------------------------------------------------ */

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { FieldMapTemplate } from "./field-maps";
import { applyTransform } from "./transforms";

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  format: "csv" | "xlsx" | "tsv";
}

/** Parse a CSV/TSV string into headers + rows */
export function parseCSV(csvText: string): ParsedFile {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const delimiter = result.meta.delimiter;
  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    rowCount: result.data.length,
    format: delimiter === "\t" ? "tsv" : "csv",
  };
}

/** Parse an XLSX buffer into headers + rows */
export function parseXLSX(buffer: ArrayBuffer): ParsedFile {
  const workbook = XLSX.read(buffer, { type: "array" });
  // Use the first sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: "",
    raw: false, // Force string output for consistency
  });

  const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

  return {
    headers: headers.map((h) => h.trim()),
    rows: jsonData.map((row) => {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        cleaned[k.trim()] = String(v ?? "").trim();
      }
      return cleaned;
    }),
    rowCount: jsonData.length,
    format: "xlsx",
  };
}

/** Auto-detect format and parse */
export function parseFile(
  content: string | ArrayBuffer,
  fileName: string
): ParsedFile {
  const ext = fileName.toLowerCase().split(".").pop();

  if (ext === "xlsx" || ext === "xls") {
    if (typeof content === "string") {
      throw new Error("XLSX files must be provided as ArrayBuffer");
    }
    return parseXLSX(content);
  }

  // CSV/TSV/TXT — treat as text
  const text = typeof content === "string"
    ? content
    : new TextDecoder().decode(content);
  return parseCSV(text);
}

/** Apply field mapping + transforms to parsed rows */
export function mapRows(
  rows: Record<string, string>[],
  fieldMapping: Record<string, string>,
  transforms: Record<string, string>
): Record<string, unknown>[] {
  return rows.map((row) => {
    const mapped: Record<string, unknown> = {};

    for (const [sourceCol, targetField] of Object.entries(fieldMapping)) {
      if (!targetField || !sourceCol) continue;
      let value: unknown = row[sourceCol];

      // Apply transform if one exists for this target field
      const transform = transforms[targetField];
      if (transform) {
        value = applyTransform(value, transform);
      }

      // Handle nested fields (e.g., "attributes.condition")
      if (targetField.includes(".")) {
        const [parent, child] = targetField.split(".");
        if (!mapped[parent]) mapped[parent] = {};
        (mapped[parent] as Record<string, unknown>)[child] = value;
      } else {
        mapped[targetField] = value;
      }
    }

    return mapped;
  });
}

/** Auto-detect field mapping from CSV headers using a template */
export function autoMapFields(
  csvHeaders: string[],
  template: FieldMapTemplate[]
): { fieldMapping: Record<string, string>; transforms: Record<string, string> } {
  const fieldMapping: Record<string, string> = {};
  const transforms: Record<string, string> = {};

  const headerLower = csvHeaders.map((h) => h.toLowerCase().trim());

  for (const tmpl of template) {
    // Try exact match first (case-insensitive)
    const idx = headerLower.indexOf(tmpl.source.toLowerCase().trim());
    if (idx >= 0) {
      fieldMapping[csvHeaders[idx]] = tmpl.target;
      if (tmpl.transform) {
        transforms[tmpl.target] = tmpl.transform;
      }
    }
  }

  return { fieldMapping, transforms };
}

/** Generate SHA-256 hash of file content for idempotency */
export async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
