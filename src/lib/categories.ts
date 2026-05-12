// Entity-scoped project categories for time entries.
//
// Two outputs flow from a single (entity, category) pair on each entry:
//   1. **Internal project tracking** — granular, all 10 categories
//   2. **Payroll submission** — collapsed to 8 buckets (the 3 Corp
//      categories S&M / GHL / Corporate Wellness roll up to one
//      "Corp S&M Labor" line)
//
// The bookkeeper (Cory) gets the suggested GL code on the export and
// can override on her side; the app doesn't post journal entries.
//
// Edit this file to add/rename categories or change GL coding. No DB
// migration needed — `time_entries.category` is a plain text column,
// validated against this list at the UI layer.

import type { EntityName } from '@/types/db'

export type PayrollBucket =
  | 'Plano FOH Labor'
  | 'Plano S&M Labor'
  | 'Plano Admin Labor'
  | 'Corp S&M Labor'
  | 'Corp Admin Labor'
  | 'Dallas S&M Labor'
  | 'Dallas Admin Labor'
  | 'Dallas Construction Labor'

export type CategoryConfig = {
  name: string
  payroll_bucket: PayrollBucket
  gl_code_suggestion: string
}

export const CATEGORIES_BY_ENTITY: Record<EntityName, CategoryConfig[]> = {
  Plano: [
    {
      name: 'FOH',
      payroll_bucket: 'Plano FOH Labor',
      gl_code_suggestion: 'Plano / Front Desk Labor',
    },
    {
      name: 'Sales & Marketing',
      payroll_bucket: 'Plano S&M Labor',
      gl_code_suggestion: 'Plano / 60110 Sales & Marketing Labor',
    },
    {
      name: 'Admin',
      payroll_bucket: 'Plano Admin Labor',
      gl_code_suggestion: 'Plano / 60020 G&A – Admin',
    },
  ],
  Corporate: [
    {
      name: 'Sales & Marketing',
      payroll_bucket: 'Corp S&M Labor',
      gl_code_suggestion: 'Corp / 60110 Sales & Marketing Labor',
    },
    {
      name: 'GHL',
      payroll_bucket: 'Corp S&M Labor',
      gl_code_suggestion: 'Corp / 60110 Sales & Marketing Labor',
    },
    {
      name: 'Corporate Wellness',
      payroll_bucket: 'Corp S&M Labor',
      gl_code_suggestion: 'Corp / 60110 Sales & Marketing Labor',
    },
    {
      name: 'Admin',
      payroll_bucket: 'Corp Admin Labor',
      gl_code_suggestion: 'Corp / 60020 G&A – Admin',
    },
  ],
  Dallas: [
    {
      name: 'Sales & Marketing',
      payroll_bucket: 'Dallas S&M Labor',
      gl_code_suggestion:
        'Dallas / 60110 Sales & Marketing Labor (pre-open; capitalize to Parent 19040)',
    },
    {
      name: 'Admin',
      payroll_bucket: 'Dallas Admin Labor',
      gl_code_suggestion:
        'Dallas / 60020 G&A – Admin (pre-open; capitalize to Parent 19040)',
    },
    {
      name: 'Construction Development',
      payroll_bucket: 'Dallas Construction Labor',
      gl_code_suggestion:
        'Dallas / Construction Labor (Capitalized) — Parent 19040 Investment in BMF - Uptown, LLC',
    },
  ],
}

export function categoryNamesFor(entity: EntityName): string[] {
  return CATEGORIES_BY_ENTITY[entity].map(c => c.name)
}

// Returns config for an (entity, category) pair, or null if the pair is
// unknown (e.g. an old entry from before categories existed, or a renamed
// category). Callers should fall back to "Uncategorized" on null.
export function lookupCategory(
  entity: EntityName,
  category: string | null,
): CategoryConfig | null {
  if (!category) return null
  return CATEGORIES_BY_ENTITY[entity].find(c => c.name === category) ?? null
}

export function payrollBucketFor(
  entity: EntityName,
  category: string | null,
): PayrollBucket | 'Uncategorized' {
  return lookupCategory(entity, category)?.payroll_bucket ?? 'Uncategorized'
}

export function glCodeFor(entity: EntityName, category: string | null): string {
  return lookupCategory(entity, category)?.gl_code_suggestion ?? '—'
}
