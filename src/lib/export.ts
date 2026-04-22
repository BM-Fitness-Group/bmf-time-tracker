import ExcelJS from 'exceljs'
import { entryHours, toDateOnly } from '@/lib/time'
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

  addSummarySheet(wb, weekStartMonday, weekEndingSunday, rows)
  addDetailSheet(wb, rows)
  addByEntitySheet(wb, rows)

  return wb.xlsx.writeBuffer()
}

export function payrollFilename(weekEndingSunday: Date): string {
  return `BMF_Payroll_WE_${toDateOnly(weekEndingSunday)}.xlsx`
}

function addSummarySheet(
  wb: ExcelJS.Workbook,
  weekStartMonday: Date,
  weekEndingSunday: Date,
  rows: ExportRow[],
) {
  const ws = wb.addWorksheet('Summary', {
    views: [{ state: 'frozen', ySplit: 4 }],
  })
  ws.columns = [
    { width: 25 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ]

  ws.mergeCells('A1:E1')
  ws.getCell('A1').value = 'BMF WEEKLY PAYROLL'
  ws.getCell('A1').font = { bold: true, size: 16 }
  ws.getCell('A1').alignment = { horizontal: 'center' }

  ws.mergeCells('A2:E2')
  ws.getCell('A2').value =
    `Pay Period: ${formatReadableDate(weekStartMonday)} – ${formatReadableDate(weekEndingSunday)}`
  ws.getCell('A2').font = { italic: true, size: 11 }
  ws.getCell('A2').alignment = { horizontal: 'center' }

  const headerRow = ws.getRow(4)
  headerRow.values = [
    'Employee',
    'Corporate Hours',
    'Plano Hours',
    'Dallas Hours',
    'Total Hours',
  ]
  headerRow.font = { bold: true }
  headerRow.eachCell(cell => {
    cell.border = { bottom: { style: 'thin' } }
  })

  let totalCorp = 0
  let totalPlano = 0
  let totalDallas = 0

  const sorted = [...rows].sort((a, b) =>
    a.employee.full_name.localeCompare(b.employee.full_name),
  )

  sorted.forEach((row, i) => {
    const breakdown = entityBreakdown(row.entries)
    totalCorp += breakdown.Corporate
    totalPlano += breakdown.Plano
    totalDallas += breakdown.Dallas
    const total = breakdown.Corporate + breakdown.Plano + breakdown.Dallas
    const r = ws.getRow(5 + i)
    r.values = [
      row.employee.full_name,
      round2(breakdown.Corporate),
      round2(breakdown.Plano),
      round2(breakdown.Dallas),
      round2(total),
    ]
    ;['B', 'C', 'D', 'E'].forEach(col => {
      const cell = r.getCell(col)
      cell.numFmt = '0.00'
    })
    if (!row.approved) {
      r.getCell('A').note = 'Week not yet approved'
      r.font = { italic: true }
    }
  })

  const totalRowIdx = 5 + sorted.length
  const totalRow = ws.getRow(totalRowIdx)
  totalRow.values = [
    'TOTAL',
    round2(totalCorp),
    round2(totalPlano),
    round2(totalDallas),
    round2(totalCorp + totalPlano + totalDallas),
  ]
  totalRow.font = { bold: true }
  totalRow.eachCell(cell => {
    cell.border = { top: { style: 'thin' } }
  })
  ;['B', 'C', 'D', 'E'].forEach(col => {
    totalRow.getCell(col).numFmt = '0.00'
  })
}

function addDetailSheet(wb: ExcelJS.Workbook, rows: ExportRow[]) {
  const ws = wb.addWorksheet('Detail', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  ws.columns = [
    { header: 'Employee', key: 'employee', width: 22 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Day', key: 'day', width: 10 },
    { header: 'Entity', key: 'entity', width: 12 },
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
    header.eachCell(cell => {
      cell.border = { bottom: { style: 'thin' } }
    })

    const withHours = rows
      .map(r => ({
        name: r.employee.full_name,
        hours: entityBreakdown(r.entries)[entity],
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
    total.eachCell(cell => {
      cell.border = { top: { style: 'thin' } }
    })
    total.getCell('B').numFmt = '0.00'

    rIdx++ // blank row between entities
  }
}

function entityBreakdown(entries: TimeEntry[]): Record<EntityName, number> {
  const totals: Record<EntityName, number> = { Corporate: 0, Plano: 0, Dallas: 0 }
  for (const e of entries) totals[e.entity] += entryHours(e)
  return totals
}

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
  // "Apr 22, 2026" — used in Detail sheet where weekday is a separate column.
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
