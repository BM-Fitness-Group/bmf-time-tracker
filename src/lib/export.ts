import ExcelJS from 'exceljs'
import { entryHours, toDateOnly } from '@/lib/time'
import { glCodeFor, payrollBucketFor } from '@/lib/categories'
import type { Employee, EntityName, TimeEntry } from '@/types/db'

const ENTITIES: EntityName[] = ['Corporate', 'Plano', 'Dallas']

type ExportRow = {
  employee: Employee
  entries: TimeEntry[]
  approved: boolean
}

export async function buildPayrollWorkbook(
  weekEndingSunday: Date,
  rows: ExportRow[],
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'BMF Time Tracker'
  wb.created = new Date()

  const weekStartMonday = new Date(weekEndingSunday)
  weekStartMonday.setDate(weekStartMonday.getDate() - 6)

  addPayrollSubmissionSheet(wb, weekStartMonday, weekEndingSunday, rows)
  addByProjectSheet(wb, weekStartMonday, weekEndingSunday, rows)
  addDetailSheet(wb, rows)
  addByEntitySheet(wb, rows)

  return wb.xlsx.writeBuffer()
}

export function payrollFilename(weekEndingSunday: Date): string {
  return `BMF_Payroll_WE_${toDateOnly(weekEndingSunday)}.xlsx`
}

// =============================================================
// Sheet 1: "Payroll Submission"
// One row per (employee × payroll bucket). 10 app categories collapse
// into 8 GL-coded buckets so payroll company sees clean coding.
// =============================================================
function addPayrollSubmissionSheet(
  wb: ExcelJS.Workbook,
  weekStart: Date,
  weekEnd: Date,
  rows: ExportRow[],
) {
  const ws = wb.addWorksheet('Payroll Submission', {
    views: [{ state: 'frozen', ySplit: 4 }],
  })
  ws.columns = [
    { width: 22 }, // Pay Period
    { width: 22 }, // Employee
    { width: 12 }, // Entity
    { width: 28 }, // Bucket
    { width: 52 }, // GL Code suggestion
    { width: 10 }, // Hours
  ]

  ws.mergeCells('A1:F1')
  ws.getCell('A1').value = 'BMF WEEKLY PAYROLL'
  ws.getCell('A1').font = { bold: true, size: 16 }
  ws.getCell('A1').alignment = { horizontal: 'center' }

  ws.mergeCells('A2:F2')
  ws.getCell('A2').value =
    `Pay Period: ${formatReadableDate(weekStart)} – ${formatReadableDate(weekEnd)}`
  ws.getCell('A2').font = { italic: true, size: 11 }
  ws.getCell('A2').alignment = { horizontal: 'center' }

  const header = ws.getRow(4)
  header.values = [
    'Pay Period',
    'Employee',
    'Entity',
    'Payroll Bucket',
    'Suggested GL Code',
    'Hours',
  ]
  header.font = { bold: true }
  header.eachCell(c => {
    c.border = { bottom: { style: 'thin' } }
  })

  const periodLabel = `${toDateOnly(weekStart)} to ${toDateOnly(weekEnd)}`

  // Aggregate hours per (employee, entity, bucket, gl_code). Track unapproved
  // employees so we can flag them in the output.
  type Key = string
  type Agg = {
    employee_name: string
    entity: EntityName
    bucket: string
    gl_code: string
    hours: number
    approved: boolean
  }
  const buckets = new Map<Key, Agg>()
  const sorted = [...rows].sort((a, b) =>
    a.employee.full_name.localeCompare(b.employee.full_name),
  )
  for (const row of sorted) {
    for (const e of row.entries) {
      const bucket = payrollBucketFor(e.entity, e.category)
      const gl = glCodeFor(e.entity, e.category)
      const key = `${row.employee.id}::${e.entity}::${bucket}`
      const existing = buckets.get(key)
      if (existing) {
        existing.hours += entryHours(e)
      } else {
        buckets.set(key, {
          employee_name: row.employee.full_name,
          entity: e.entity,
          bucket,
          gl_code: gl,
          hours: entryHours(e),
          approved: row.approved,
        })
      }
    }
  }

  let rIdx = 5
  let total = 0
  // Sort: employee → entity → bucket
  const aggList = Array.from(buckets.values()).sort((a, b) => {
    const n = a.employee_name.localeCompare(b.employee_name)
    if (n !== 0) return n
    const e = a.entity.localeCompare(b.entity)
    if (e !== 0) return e
    return a.bucket.localeCompare(b.bucket)
  })
  for (const agg of aggList) {
    const r = ws.getRow(rIdx++)
    r.values = [
      periodLabel,
      agg.employee_name,
      agg.entity,
      agg.bucket,
      agg.gl_code,
      round2(agg.hours),
    ]
    r.getCell('F').numFmt = '0.00'
    if (!agg.approved) {
      r.getCell('B').note = 'Week not yet approved'
      r.font = { italic: true }
    }
    total += agg.hours
  }

  const totalRow = ws.getRow(rIdx)
  totalRow.values = ['', '', '', '', 'TOTAL', round2(total)]
  totalRow.font = { bold: true }
  totalRow.eachCell(c => {
    c.border = { top: { style: 'thin' } }
  })
  totalRow.getCell('F').numFmt = '0.00'
}

// =============================================================
// Sheet 2: "By Project"
// Internal management report. Granular — every (employee × entity ×
// category) combination, plus % of that employee's period.
// =============================================================
function addByProjectSheet(
  wb: ExcelJS.Workbook,
  weekStart: Date,
  weekEnd: Date,
  rows: ExportRow[],
) {
  const ws = wb.addWorksheet('By Project', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  ws.columns = [
    { header: 'Pay Period', key: 'period', width: 22 },
    { header: 'Employee', key: 'employee', width: 22 },
    { header: 'Entity', key: 'entity', width: 12 },
    { header: 'Project', key: 'project', width: 26 },
    { header: 'Hours', key: 'hours', width: 10 },
    { header: '% of period', key: 'pct', width: 12 },
  ]
  ws.getRow(1).font = { bold: true }

  const periodLabel = `${toDateOnly(weekStart)} to ${toDateOnly(weekEnd)}`
  const sorted = [...rows].sort((a, b) =>
    a.employee.full_name.localeCompare(b.employee.full_name),
  )

  let rIdx = 2
  for (const row of sorted) {
    // Group this employee's entries by (entity, category).
    const buckets = new Map<string, { entity: EntityName; project: string; hours: number }>()
    let employeeTotal = 0
    for (const e of row.entries) {
      const project = e.category ?? 'Uncategorized'
      const key = `${e.entity}::${project}`
      const h = entryHours(e)
      employeeTotal += h
      const existing = buckets.get(key)
      if (existing) existing.hours += h
      else buckets.set(key, { entity: e.entity, project, hours: h })
    }

    // Stable sort: entity (Corporate/Plano/Dallas), then project name.
    const projects = Array.from(buckets.values()).sort((a, b) => {
      const ent = ENTITIES.indexOf(a.entity) - ENTITIES.indexOf(b.entity)
      if (ent !== 0) return ent
      return a.project.localeCompare(b.project)
    })

    for (const p of projects) {
      const r = ws.getRow(rIdx++)
      r.values = {
        period: periodLabel,
        employee: row.employee.full_name,
        entity: p.entity,
        project: p.project,
        hours: round2(p.hours),
        pct: employeeTotal > 0 ? p.hours / employeeTotal : 0,
      } as unknown as ExcelJS.CellValue[]
      r.getCell('hours').numFmt = '0.00'
      r.getCell('pct').numFmt = '0.0%'
    }

    // Subtotal row per employee (visually separates blocks).
    const sub = ws.getRow(rIdx++)
    sub.values = {
      period: '',
      employee: `${row.employee.full_name} – TOTAL`,
      entity: '',
      project: '',
      hours: round2(employeeTotal),
      pct: 1,
    } as unknown as ExcelJS.CellValue[]
    sub.font = { bold: true }
    sub.eachCell(c => {
      c.border = { top: { style: 'thin' } }
    })
    sub.getCell('hours').numFmt = '0.00'
    sub.getCell('pct').numFmt = '0.0%'

    rIdx++ // blank row between employees
  }
}

// =============================================================
// Sheet 3: "Detail" — every entry, with Category column.
// =============================================================
function addDetailSheet(wb: ExcelJS.Workbook, rows: ExportRow[]) {
  const ws = wb.addWorksheet('Detail', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  ws.columns = [
    { header: 'Employee', key: 'employee', width: 22 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Day', key: 'day', width: 10 },
    { header: 'Entity', key: 'entity', width: 12 },
    { header: 'Project', key: 'project', width: 22 },
    { header: 'Clock In', key: 'clock_in', width: 10 },
    { header: 'Clock Out', key: 'clock_out', width: 10 },
    { header: 'Break (min)', key: 'break', width: 11 },
    { header: 'Hours', key: 'hours', width: 10 },
    { header: 'Notes', key: 'notes', width: 30 },
    { header: 'Approved', key: 'approved', width: 10 },
  ]
  ws.getRow(1).font = { bold: true }

  const sorted = [...rows].sort((a, b) =>
    a.employee.full_name.localeCompare(b.employee.full_name),
  )

  let rIdx = 2
  for (const row of sorted) {
    const entries = [...row.entries].sort(
      (a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime(),
    )
    for (const e of entries) {
      const ci = new Date(e.clock_in)
      const co = e.clock_out ? new Date(e.clock_out) : null
      const r = ws.getRow(rIdx++)
      r.values = {
        employee: row.employee.full_name,
        date: formatShortDate(ci),
        day: ci.toLocaleDateString([], { weekday: 'short' }),
        entity: e.entity,
        project: e.category ?? 'Uncategorized',
        clock_in: formatTime(ci),
        clock_out: co ? formatTime(co) : '',
        break: e.break_minutes,
        hours: round2(entryHours(e)),
        notes: e.notes,
        approved: e.is_approved ? 'Yes' : 'No',
      } as unknown as ExcelJS.CellValue[]
      r.getCell('hours').numFmt = '0.00'
      if ((rIdx - 2) % 2 === 1) {
        r.eachCell(cell => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF7F7F7' },
          }
        })
      }
    }
  }
}

// =============================================================
// Sheet 4: "By Entity" — total hours per studio across all staff.
// =============================================================
function addByEntitySheet(wb: ExcelJS.Workbook, rows: ExportRow[]) {
  const ws = wb.addWorksheet('By Entity', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  ws.columns = [{ width: 25 }, { width: 15 }]

  let rIdx = 1
  for (const entity of ENTITIES) {
    const title = ws.getRow(rIdx++)
    ws.mergeCells(`A${title.number}:B${title.number}`)
    title.getCell('A').value = entity
    title.getCell('A').font = { bold: true, size: 14 }

    const header = ws.getRow(rIdx++)
    header.values = ['Employee', 'Hours']
    header.font = { bold: true }
    header.eachCell(c => {
      c.border = { bottom: { style: 'thin' } }
    })

    const withHours = rows
      .map(r => ({
        name: r.employee.full_name,
        hours: r.entries
          .filter(e => e.entity === entity)
          .reduce((s, e) => s + entryHours(e), 0),
      }))
      .filter(r => r.hours > 0)
      .sort((a, b) => a.name.localeCompare(b.name))

    let subtotal = 0
    for (const row of withHours) {
      subtotal += row.hours
      const r = ws.getRow(rIdx++)
      r.values = [row.name, round2(row.hours)]
      r.getCell('B').numFmt = '0.00'
    }

    const total = ws.getRow(rIdx++)
    total.values = ['Subtotal', round2(subtotal)]
    total.font = { bold: true }
    total.eachCell(c => {
      c.border = { top: { style: 'thin' } }
    })
    total.getCell('B').numFmt = '0.00'

    rIdx++ // blank row between entities
  }
}

// =============================================================
// helpers
// =============================================================
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatReadableDate(d: Date): string {
  // "Wednesday, Apr 22, 2026" — long weekday + short month, per user preference.
  return d.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatShortDate(d: Date): string {
  // "Apr 22, 2026" — Detail sheet, where weekday is a separate column.
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
