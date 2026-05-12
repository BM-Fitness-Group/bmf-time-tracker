import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Clock,
  Coffee,
  LogOut,
  Pause,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { useTracker } from '@/lib/tracker'
import {
  entryHours,
  fmtClock,
  fmtElapsed,
  fmtHours,
  sumByEntity,
} from '@/lib/time'
import { CATEGORIES_BY_ENTITY, categoryNamesFor } from '@/lib/categories'
import OvertimeBanner from '@/components/OvertimeBanner'
import LongSessionBanner from '@/components/LongSessionBanner'
import type { ActiveSession, EntityName, TimeEntry } from '@/types/db'

const ENTITIES: EntityName[] = ['Corporate', 'Plano', 'Dallas']

const ENTITY_DOT: Record<EntityName, string> = {
  Corporate: 'bg-zinc-600',
  Plano: 'bg-orange-500',
  Dallas: 'bg-sky-600',
}

export default function Tracker() {
  const { employee, signOut } = useAuth()
  const tracker = useTracker(employee?.id ?? null)
  const [manualOpen, setManualOpen] = useState(false)

  if (!employee) return null

  return (
    <div className="min-h-screen bg-white text-zinc-900 p-5">
      <div className="max-w-xl mx-auto">
        <Header
          name={employee.full_name}
          isAdmin={employee.role === 'admin'}
          onSignOut={signOut}
        />

        {tracker.error && (
          <div className="mb-4 border border-red-300 bg-red-50 rounded-lg p-3 text-xs text-red-800">
            {tracker.error}
          </div>
        )}

        <LongSessionBanner session={tracker.activeSession} />

        <OvertimeBanner
          entries={tracker.entries}
          activeSession={tracker.activeSession}
        />

        <WeekSummary entries={tracker.entries} />

        {tracker.activeSession ? (
          <ActiveSessionCard
            session={tracker.activeSession}
            onClockOut={tracker.clockOut}
            onSwitch={tracker.switchTo}
            onStartBreak={tracker.startBreak}
            onEndBreak={tracker.endBreak}
            onUpdateNotes={tracker.updateNotes}
            onUpdateCategory={tracker.updateActiveCategory}
          />
        ) : (
          <ClockInCard onClockIn={tracker.clockIn} loading={tracker.loading} />
        )}

        <EntriesList
          entries={tracker.todaysEntries}
          onDelete={tracker.deleteEntry}
          onUpdateNotes={tracker.updateEntryNotes}
          onUpdateCategory={tracker.updateEntryCategory}
        />

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={() => setManualOpen(true)}
            className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 hover:text-red-800 flex items-center gap-2"
          >
            <Plus className="w-3 h-3" />
            MANUAL ENTRY
          </button>
          <button
            onClick={() => tracker.refresh()}
            className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 hover:text-red-800 flex items-center gap-2"
          >
            <RefreshCw className="w-3 h-3" />
            REFRESH
          </button>
        </div>
      </div>

      {manualOpen && (
        <ManualEntryModal
          onClose={() => setManualOpen(false)}
          onSubmit={async input => {
            await tracker.addManualEntry(input)
            setManualOpen(false)
          }}
        />
      )}
    </div>
  )
}

function Header({
  name,
  isAdmin,
  onSignOut,
}: {
  name: string
  isAdmin: boolean
  onSignOut: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-5 pb-4 border-b border-zinc-200">
      <div>
        <h1 className="text-2xl font-black tracking-tighter leading-none text-red-800">
          BMF
        </h1>
        <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 mt-1">
          TIME TRACKER
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-xs text-zinc-600">{name}</div>
          {isAdmin && (
            <Link
              to="/admin"
              className="text-[10px] font-bold tracking-[0.3em] text-red-700 hover:text-red-900"
            >
              ADMIN →
            </Link>
          )}
        </div>
        <button
          onClick={onSignOut}
          className="text-zinc-500 hover:text-red-800"
          aria-label="sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function WeekSummary({ entries }: { entries: TimeEntry[] }) {
  const totals = useMemo(() => sumByEntity(entries), [entries])
  const total = totals.Corporate + totals.Plano + totals.Dallas
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 mb-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500">
          THIS WEEK
        </div>
        <div className="text-2xl font-black tabular-nums">{fmtHours(total)}h</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ENTITIES.map(name => (
          <div
            key={name}
            className="bg-zinc-50 border border-zinc-200 rounded-lg p-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${ENTITY_DOT[name]}`} />
              <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-500">
                {name.toUpperCase()}
              </span>
            </div>
            <div className="text-lg font-black tabular-nums">
              {fmtHours(totals[name])}h
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EntityCategoryPicker({
  entity,
  category,
  onChange,
  excludeSame,
}: {
  entity: EntityName | null
  category: string | null
  onChange: (entity: EntityName, category: string) => void
  // If set, pressing "same as current" combo is allowed but visually muted.
  // Used by the switch flow.
  excludeSame?: { entity: EntityName; category: string } | null
}) {
  // Local "selected entity but not yet category" state for the two-step pick.
  const [pendingEntity, setPendingEntity] = useState<EntityName | null>(entity)

  // Re-sync when parent forces a new entity (e.g. cleared after clock-in).
  useEffect(() => {
    setPendingEntity(entity)
  }, [entity])

  const categories = pendingEntity ? categoryNamesFor(pendingEntity) : []

  return (
    <>
      <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 mb-2">
        ENTITY
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {ENTITIES.map(name => (
          <button
            key={name}
            type="button"
            onClick={() => {
              setPendingEntity(name)
              // If only one category exists, auto-select it. Otherwise wait
              // for explicit pick.
              const cats = categoryNamesFor(name)
              if (cats.length === 1) onChange(name, cats[0])
            }}
            className={`p-3 rounded-lg border text-left transition ${
              pendingEntity === name
                ? 'border-red-700 bg-red-50 ring-1 ring-red-700/20'
                : 'border-zinc-200 hover:border-zinc-400 bg-zinc-50'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${ENTITY_DOT[name]}`} />
              <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-600">
                {name.toUpperCase()}
              </span>
            </div>
            <Building2 className="w-4 h-4 text-zinc-500" />
          </button>
        ))}
      </div>

      {pendingEntity && (
        <>
          <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 mb-2">
            PROJECT
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {categories.map(catName => {
              const isCurrent =
                excludeSame?.entity === pendingEntity &&
                excludeSame?.category === catName
              const isPicked =
                pendingEntity === entity && catName === category
              return (
                <button
                  key={catName}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => onChange(pendingEntity, catName)}
                  className={`p-2 rounded-lg border text-xs font-bold tracking-wide transition ${
                    isPicked
                      ? 'border-red-700 bg-red-50 ring-1 ring-red-700/20 text-zinc-900'
                      : isCurrent
                      ? 'border-zinc-200 bg-zinc-50 text-zinc-400'
                      : 'border-zinc-200 hover:border-zinc-400 bg-white text-zinc-700'
                  }`}
                  title={isCurrent ? 'Currently on this project' : undefined}
                >
                  {catName}
                  {isCurrent && (
                    <span className="block text-[9px] font-normal tracking-wider text-zinc-400 mt-0.5">
                      CURRENT
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

function ClockInCard({
  onClockIn,
  loading,
}: {
  onClockIn: (entity: EntityName, category: string, notes?: string) => Promise<void>
  loading: boolean
}) {
  const [entity, setEntity] = useState<EntityName | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async () => {
    if (!entity || !category) return
    setBusy(true)
    await onClockIn(entity, category, notes)
    setBusy(false)
    setNotes('')
    setEntity(null)
    setCategory(null)
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 mb-5 shadow-sm">
      <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 mb-3">
        CLOCK IN
      </div>
      <EntityCategoryPicker
        entity={entity}
        category={category}
        onChange={(e, c) => {
          setEntity(e)
          setCategory(c)
        }}
      />
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        placeholder="Notes (optional)"
        className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 mb-4 text-sm placeholder-zinc-400 focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20 resize-none"
      />
      <button
        onClick={go}
        disabled={!entity || !category || busy || loading}
        className="w-full bg-red-800 hover:bg-red-900 text-white font-black py-4 rounded-lg transition flex items-center justify-center gap-2 tracking-wider disabled:bg-zinc-200 disabled:text-zinc-400"
      >
        <Clock className="w-4 h-4" />
        {busy ? 'STARTING...' : 'CLOCK IN'}
      </button>
    </div>
  )
}

function ActiveSessionCard({
  session,
  onClockOut,
  onSwitch,
  onStartBreak,
  onEndBreak,
  onUpdateNotes,
  onUpdateCategory,
}: {
  session: ActiveSession
  onClockOut: () => Promise<unknown>
  onSwitch: (entity: EntityName, category: string) => Promise<unknown>
  onStartBreak: () => Promise<unknown>
  onEndBreak: () => Promise<unknown>
  onUpdateNotes: (notes: string) => Promise<unknown>
  onUpdateCategory: (category: string) => Promise<unknown>
}) {
  const [now, setNow] = useState(Date.now())
  const [notes, setNotes] = useState(session.notes ?? '')
  const [notesDirty, setNotesDirty] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [showSwitch, setShowSwitch] = useState(false)
  const [showCategoryFix, setShowCategoryFix] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!notesDirty) setNotes(session.notes ?? '')
  }, [session.notes, notesDirty])

  const onBreak = !!session.break_start
  const clockInMs = new Date(session.clock_in).getTime()
  const currentBreakMs = session.break_start
    ? now - new Date(session.break_start).getTime()
    : 0
  const elapsedMs =
    now -
    clockInMs -
    session.break_minutes * 60_000 -
    (onBreak ? currentBreakMs : 0)

  const withBusy = async (tag: string, fn: () => Promise<unknown>) => {
    setBusy(tag)
    await fn()
    setBusy(null)
  }

  const saveNotes = async () => {
    if (!notesDirty) return
    await onUpdateNotes(notes)
    setNotesDirty(false)
  }

  // Existing sessions started before categories existed have null. Prompt
  // user to set one before they clock out so the entry isn't Uncategorized.
  const missingCategory = !session.category

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 mb-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${ENTITY_DOT[session.entity]}`} />
          <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500">
            ON THE CLOCK · {session.entity.toUpperCase()}
            {session.category && ` · ${session.category.toUpperCase()}`}
          </div>
        </div>
        <div className="text-[10px] font-bold tracking-[0.2em] text-zinc-500">
          Since {fmtClock(session.clock_in)}
        </div>
      </div>

      {missingCategory && !showCategoryFix && (
        <div className="mb-3 border border-amber-300 bg-amber-50 rounded p-2 text-xs text-amber-900 flex items-center justify-between gap-2">
          <span>This session has no project category set.</span>
          <button
            onClick={() => setShowCategoryFix(true)}
            className="text-[10px] font-bold tracking-widest text-amber-900 hover:underline"
          >
            SET →
          </button>
        </div>
      )}

      {showCategoryFix && (
        <div className="mb-3 border border-zinc-200 rounded p-3">
          <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 mb-2">
            SET PROJECT
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES_BY_ENTITY[session.entity].map(c => (
              <button
                key={c.name}
                onClick={async () => {
                  await onUpdateCategory(c.name)
                  setShowCategoryFix(false)
                }}
                className="p-2 rounded border border-zinc-200 hover:border-zinc-400 bg-white text-xs font-bold"
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-center py-4">
        <div className="text-5xl font-black tabular-nums tracking-tighter">
          {fmtElapsed(elapsedMs)}
        </div>
        {onBreak && (
          <div className="mt-2 text-[10px] font-bold tracking-[0.3em] text-amber-600">
            ON BREAK · {fmtElapsed(currentBreakMs)}
          </div>
        )}
        {!onBreak && session.break_minutes > 0 && (
          <div className="mt-2 text-[10px] font-bold tracking-[0.3em] text-zinc-500">
            BREAK TAKEN · {session.break_minutes} MIN
          </div>
        )}
      </div>

      <textarea
        value={notes}
        onChange={e => {
          setNotes(e.target.value)
          setNotesDirty(true)
        }}
        onBlur={saveNotes}
        rows={2}
        placeholder="Notes / project detail"
        className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 mb-4 text-sm placeholder-zinc-400 focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20 resize-none"
      />

      <div className="grid grid-cols-2 gap-2 mb-2">
        <button
          onClick={() =>
            withBusy('break', onBreak ? onEndBreak : onStartBreak)
          }
          disabled={busy !== null}
          className="border border-zinc-300 rounded-lg py-3 text-xs font-bold tracking-widest hover:border-zinc-500 hover:bg-zinc-50 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {onBreak ? <Pause className="w-4 h-4" /> : <Coffee className="w-4 h-4" />}
          {onBreak ? 'END BREAK' : 'START BREAK'}
        </button>
        <button
          onClick={() => setShowSwitch(s => !s)}
          disabled={busy !== null || onBreak}
          className="border border-zinc-300 rounded-lg py-3 text-xs font-bold tracking-widest hover:border-zinc-500 hover:bg-zinc-50 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Building2 className="w-4 h-4" />
          SWITCH
        </button>
      </div>

      {showSwitch && (
        <div className="mt-2 p-3 border border-zinc-200 rounded-lg">
          <EntityCategoryPicker
            entity={session.entity}
            category={session.category}
            excludeSame={
              session.category
                ? { entity: session.entity, category: session.category }
                : null
            }
            onChange={async (e, c) => {
              setShowSwitch(false)
              await withBusy('switch', () => onSwitch(e, c))
            }}
          />
        </div>
      )}

      <button
        onClick={() => withBusy('out', onClockOut)}
        disabled={busy !== null}
        className="w-full bg-red-800 hover:bg-red-900 text-white font-black py-4 rounded-lg transition tracking-wider disabled:bg-zinc-200 disabled:text-zinc-400 flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" />
        {busy === 'out' ? 'CLOCKING OUT...' : 'CLOCK OUT'}
      </button>
    </div>
  )
}

function EntriesList({
  entries,
  onDelete,
  onUpdateNotes,
  onUpdateCategory,
}: {
  entries: TimeEntry[]
  onDelete: (id: string) => Promise<unknown>
  onUpdateNotes: (id: string, notes: string) => Promise<unknown>
  onUpdateCategory: (id: string, entity: EntityName, category: string) => Promise<unknown>
}) {
  if (entries.length === 0) return null
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 mb-5 shadow-sm">
      <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 mb-3">
        TODAY
      </div>
      <ul className="divide-y divide-zinc-200">
        {entries.map(e => (
          <EntryRow
            key={e.id}
            entry={e}
            onDelete={onDelete}
            onUpdateNotes={onUpdateNotes}
            onUpdateCategory={onUpdateCategory}
          />
        ))}
      </ul>
    </div>
  )
}

function EntryRow({
  entry,
  onDelete,
  onUpdateNotes,
  onUpdateCategory,
}: {
  entry: TimeEntry
  onDelete: (id: string) => Promise<unknown>
  onUpdateNotes: (id: string, notes: string) => Promise<unknown>
  onUpdateCategory: (id: string, entity: EntityName, category: string) => Promise<unknown>
}) {
  const [notes, setNotes] = useState(entry.notes)
  const [dirty, setDirty] = useState(false)
  const [reclassOpen, setReclassOpen] = useState(false)

  useEffect(() => {
    if (!dirty) setNotes(entry.notes)
  }, [entry.notes, dirty])

  const hrs = entryHours(entry)
  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-2 h-2 rounded-full ${ENTITY_DOT[entry.entity]}`} />
            <span className="text-xs font-bold">{entry.entity}</span>
            <span className="text-xs text-zinc-500">·</span>
            <span className="text-xs text-zinc-700">
              {entry.category ?? 'Uncategorized'}
            </span>
            {entry.is_manual && (
              <span className="text-[9px] font-bold tracking-widest text-zinc-500">
                MANUAL
              </span>
            )}
            {entry.is_approved && (
              <span className="text-[9px] font-bold tracking-widest text-green-700">
                APPROVED
              </span>
            )}
          </div>
          <div className="text-[11px] text-zinc-500 tabular-nums mt-0.5">
            {fmtClock(entry.clock_in)}
            {entry.clock_out && ` → ${fmtClock(entry.clock_out)}`}
            {entry.break_minutes > 0 && ` · ${entry.break_minutes}m break`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-black tabular-nums">
            {fmtHours(hrs)}h
          </div>
        </div>
        {!entry.is_approved && (
          <button
            onClick={() => onDelete(entry.id)}
            className="text-zinc-400 hover:text-red-700"
            aria-label="delete entry"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <input
        value={notes}
        onChange={e => {
          setNotes(e.target.value)
          setDirty(true)
        }}
        onBlur={async () => {
          if (!dirty) return
          await onUpdateNotes(entry.id, notes)
          setDirty(false)
        }}
        disabled={entry.is_approved}
        placeholder="Add notes"
        className="w-full mt-2 bg-white border border-zinc-200 rounded px-2 py-1 text-xs placeholder-zinc-400 focus:outline-none focus:border-zinc-400 disabled:opacity-60 disabled:bg-zinc-50"
      />
      {!entry.is_approved && (
        <div className="mt-1">
          <button
            onClick={() => setReclassOpen(o => !o)}
            className="text-[10px] font-bold tracking-widest text-zinc-500 hover:text-red-800"
          >
            {reclassOpen ? 'CLOSE' : 'RECLASSIFY ENTITY / PROJECT'}
          </button>
          {reclassOpen && (
            <div className="mt-2 p-3 border border-zinc-200 rounded">
              <EntityCategoryPicker
                entity={entry.entity}
                category={entry.category}
                onChange={async (e, c) => {
                  await onUpdateCategory(entry.id, e, c)
                  setReclassOpen(false)
                }}
              />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function ManualEntryModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (input: {
    entity: EntityName
    category: string
    clock_in: string
    clock_out: string
    break_minutes: number
    notes: string
  }) => Promise<void>
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [entity, setEntity] = useState<EntityName>('Corporate')
  const [category, setCategory] = useState<string>(
    categoryNamesFor('Corporate')[0],
  )
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [breakMinutes, setBreakMinutes] = useState(0)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // When entity changes, reset category to that entity's first option so the
  // form is never in an inconsistent (entity, category) state.
  useEffect(() => {
    setCategory(categoryNamesFor(entity)[0])
  }, [entity])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    const ci = new Date(`${date}T${startTime}:00`)
    const co = new Date(`${date}T${endTime}:00`)
    if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) {
      setErr('Invalid date/time')
      return
    }
    if (co.getTime() <= ci.getTime()) {
      setErr('Clock-out must be after clock-in')
      return
    }
    setBusy(true)
    await onSubmit({
      entity,
      category,
      clock_in: ci.toISOString(),
      clock_out: co.toISOString(),
      break_minutes: Math.max(0, breakMinutes),
      notes,
    })
    setBusy(false)
  }

  return (
    <div
      className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center p-5 z-50"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="bg-white border border-zinc-200 rounded-xl p-5 w-full max-w-sm shadow-xl max-h-[95vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-500">
            MANUAL ENTRY
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-900">
            <X className="w-4 h-4" />
          </button>
        </div>

        <Field label="DATE">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            required
            className="w-full bg-white border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20"
          />
        </Field>

        <Field label="ENTITY">
          <div className="grid grid-cols-3 gap-2">
            {ENTITIES.map(name => (
              <button
                key={name}
                type="button"
                onClick={() => setEntity(name)}
                className={`py-2 rounded border text-[10px] font-bold tracking-widest ${
                  entity === name
                    ? 'border-red-700 bg-red-50 ring-1 ring-red-700/20'
                    : 'border-zinc-300 hover:border-zinc-500'
                }`}
              >
                {name.toUpperCase()}
              </button>
            ))}
          </div>
        </Field>

        <Field label="PROJECT">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            required
            className="w-full bg-white border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20"
          >
            {categoryNamesFor(entity).map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="CLOCK IN">
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              required
              className="w-full bg-white border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20"
            />
          </Field>
          <Field label="CLOCK OUT">
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              required
              className="w-full bg-white border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20"
            />
          </Field>
        </div>

        <Field label="BREAK (MIN)">
          <input
            type="number"
            min={0}
            value={breakMinutes}
            onChange={e => setBreakMinutes(parseInt(e.target.value || '0', 10))}
            className="w-full bg-white border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20"
          />
        </Field>

        <Field label="NOTES">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full bg-white border border-zinc-300 rounded px-3 py-2 text-sm placeholder-zinc-400 focus:outline-none focus:border-red-700 focus:ring-1 focus:ring-red-700/20 resize-none"
          />
        </Field>

        {err && <div className="text-xs text-red-700 mb-3">{err}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-red-800 hover:bg-red-900 text-white font-black py-3 rounded-lg tracking-wider disabled:bg-zinc-200 disabled:text-zinc-400"
        >
          {busy ? 'SAVING...' : 'SAVE ENTRY'}
        </button>
      </form>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block mb-3">
      <span className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 block mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}
