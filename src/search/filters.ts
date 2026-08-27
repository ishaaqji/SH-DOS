import type { FilterOperator, FilterSpec, SearchDocument } from "./types";

export function getField(doc: SearchDocument, field: string): unknown {
  if (field === "id") return doc.id;
  if (field === "workspaceId") return doc.workspaceId;
  if (field === "locale") return doc.locale;
  if (field === "type") return doc.type;
  if (field === "title") return doc.title;
  if (field === "text") return doc.text;
  if (field === "status") return doc.status;
  if (field === "createdAt") return doc.createdAt;
  if (field === "updatedAt") return doc.updatedAt;
  return doc.fields[field];
}

function scalarMatch(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) return actual.some((item) => String(item) === String(expected));
  return String(actual) === String(expected);
}

function singleFilter(spec: FilterSpec): (doc: SearchDocument) => boolean {
  switch (spec.op) {
    case "eq":
      return (doc) => scalarMatch(getField(doc, spec.field), spec.value);
    case "ne":
      return (doc) => !scalarMatch(getField(doc, spec.field), spec.value);
    case "in": {
      const values = (spec.value as Array<string | number>) ?? [];
      return (doc) => {
        const actual = getField(doc, spec.field);
        return values.some((value) => scalarMatch(actual, value));
      };
    }
    case "nin": {
      const values = (spec.value as Array<string | number>) ?? [];
      return (doc) => !values.some((value) => scalarMatch(getField(doc, spec.field), value));
    }
    case "gt":
      return (doc) => Number(getField(doc, spec.field)) > Number(spec.value);
    case "gte":
      return (doc) => Number(getField(doc, spec.field)) >= Number(spec.value);
    case "lt":
      return (doc) => Number(getField(doc, spec.field)) < Number(spec.value);
    case "lte":
      return (doc) => Number(getField(doc, spec.field)) <= Number(spec.value);
    case "range":
      return (doc) => {
        const actual = Number(getField(doc, spec.field));
        return actual >= Number(spec.min) && actual <= Number(spec.max);
      };
    case "exists":
      return (doc) => {
        const value = getField(doc, spec.field);
        return value !== undefined && value !== null && value !== "";
      };
    default:
      return () => true;
  }
}

export function buildFilter(filters: FilterSpec[]): (doc: SearchDocument) => boolean {
  const checks = filters.map(singleFilter);
  return (doc) => checks.every((check) => check(doc));
}

export const FILTER_OPERATORS: FilterOperator[] = [
  "eq", "ne", "in", "nin", "gt", "gte", "lt", "lte", "range", "exists",
];
