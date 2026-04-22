import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { weekStart, weekEnd } from '@/lib/time'
import type { ActiveSession, EntityName, TimeEntry } from '@/types/db'

type ManualEntryInput = {
  entity: EntityName
  clock_in: string // ISO
  clock_out: string // ISO
  break_minutes: number
  notes: string
}

export function useTracker(employeeId: string | null) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const logAudit = useCallback(
    async (
      action: string,
      target_type: string,
      target_id: string | null,
      details: Record<string, unknown> | null = null,
    ) => {
      if (!employeeId) return
      const { error } = await supabase.from('audit_log').insert({
        actor_id: employeeId,
        action,
        target_type,
        target_id,
        details,
      })
      if (error) console.error('audit_log insert failed', error)
    },
    [employeeId],
  )

  const loadAll = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    setError(null)
    const ws = weekStart().toISOString()
    const we = weekEnd().toISOString()
    const [sessRes, entRes] = await Promise.all([
      supabase
        .from('active_sessions')
        .select('*')
        .eq('employee_id', employeeId)
        .maybeSingle(),
      supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('clock_in', ws)
        .lt('clock_in', we)
        .order('clock_in', { ascending: false }),
    ])
    if (sessRes.error && sessRes.error.code !== 'PGRST116') {
      setError(sessRes.error.message)
    } else {
      setActiveSession(sessRes.data ?? null)
    }
    if (entRes.error) setError(entRes.error.message)
    else setEntries(entRes.data ?? [])
    setLoading(false)
  }, [employeeId])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!employeeId) return
    const ch = supabase
      .channel(`time_entries:${employeeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_entries',
          filter: `employee_id=eq.${employeeId}`,
        },
        () => {
          void loadAll()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [employeeId, loadAll])

  const clockIn = useCallback(
    async (entity: EntityName, notes = '') => {
      if (!employeeId) return
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('active_sessions')
        .insert({
          employee_id: employeeId,
          entity,
          clock_in: now,
          break_start: null,
          break_minutes: 0,
          notes,
        })
        .select('*')
        .single()
      if (error) {
        setError(error.message)
        return
      }
      setActiveSession(data)
      await logAudit('clock_in', 'active_session', employeeId, { entity })
    },
    [employeeId, logAudit],
  )

  const finalizeBreak = (s: ActiveSession): number => {
    if (!s.break_start) return s.break_minutes
    const elapsed = Math.floor(
      (Date.now() - new Date(s.break_start).getTime()) / 60000,
    )
    return s.break_minutes + Math.max(0, elapsed)
  }

  const clockOut = useCallback(async (): Promise<TimeEntry | null> => {
    if (!employeeId || !activeSession) return null
    const now = new Date().toISOString()
    const finalBreak = finalizeBreak(activeSession)
    const { data: inserted, error: insErr } = await supabase
      .from('time_entries')
      .insert({
        employee_id: employeeId,
        entity: activeSession.entity,
        clock_in: activeSession.clock_in,
        clock_out: now,
        break_minutes: finalBreak,
        notes: activeSession.notes ?? '',
        is_manual: false,
        is_approved: false,
        clock_in_location: null,
        clock_out_location: null,
      })
      .select('*')
      .single()
    if (insErr) {
      setError(insErr.message)
      return null
    }
    const { error: delErr } = await supabase
      .from('active_sessions')
      .delete()
      .eq('employee_id', employeeId)
    if (delErr) {
      setError(delErr.message)
      return null
    }
    setActiveSession(null)
    setEntries(prev => [inserted, ...prev])
    await logAudit('clock_out', 'time_entry', inserted.id, {
      entity: inserted.entity,
      break_minutes: finalBreak,
    })
    return inserted
  }, [activeSession, employeeId, logAudit])

  const switchEntity = useCallback(
    async (next: EntityName, notes = '') => {
      const prev = await clockOut()
      if (prev) {
        await logAudit('switch_entity', 'time_entry', prev.id, {
          from: prev.entity,
          to: next,
        })
      }
      await clockIn(next, notes)
    },
    [clockIn, clockOut, logAudit],
  )

  const startBreak = useCallback(async () => {
    if (!employeeId || !activeSession || activeSession.break_start) return
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('active_sessions')
      .update({ break_start: now })
      .eq('employee_id', employeeId)
      .select('*')
      .single()
    if (error) {
      setError(error.message)
      return
    }
    setActiveSession(data)
    await logAudit('break_start', 'active_session', employeeId, null)
  }, [activeSession, employeeId, logAudit])

  const endBreak = useCallback(async () => {
    if (!employeeId || !activeSession?.break_start) return
    const finalBreak = finalizeBreak(activeSession)
    const { data, error } = await supabase
      .from('active_sessions')
      .update({ break_start: null, break_minutes: finalBreak })
      .eq('employee_id', employeeId)
      .select('*')
      .single()
    if (error) {
      setError(error.message)
      return
    }
    setActiveSession(data)
    await logAudit('break_end', 'active_session', employeeId, {
      break_minutes: finalBreak,
    })
  }, [activeSession, employeeId, logAudit])

  const updateNotes = useCallback(
    async (notes: string) => {
      if (!employeeId || !activeSession) return
      const { data, error } = await supabase
        .from('active_sessions')
        .update({ notes })
        .eq('employee_id', employeeId)
        .select('*')
        .single()
      if (error) {
        setError(error.message)
        return
      }
      setActiveSession(data)
    },
    [activeSession, employeeId],
  )

  const updateEntryNotes = useCallback(
    async (entryId: string, notes: string) => {
      const target = entries.find(e => e.id === entryId)
      if (!target || target.is_approved) return
      const { data, error } = await supabase
        .from('time_entries')
        .update({ notes })
        .eq('id', entryId)
        .select('*')
        .single()
      if (error) {
        setError(error.message)
        return
      }
      setEntries(prev => prev.map(e => (e.id === entryId ? data : e)))
      await logAudit('update_entry', 'time_entry', entryId, {
        before: { notes: target.notes },
        after: { notes },
      })
    },
    [entries, logAudit],
  )

  const deleteEntry = useCallback(
    async (entryId: string) => {
      const target = entries.find(e => e.id === entryId)
      if (!target || target.is_approved) return
      const { error } = await supabase.from('time_entries').delete().eq('id', entryId)
      if (error) {
        setError(error.message)
        return
      }
      setEntries(prev => prev.filter(e => e.id !== entryId))
      await logAudit('delete_entry', 'time_entry', entryId, {
        entity: target.entity,
        clock_in: target.clock_in,
      })
    },
    [entries, logAudit],
  )

  const addManualEntry = useCallback(
    async (input: ManualEntryInput) => {
      if (!employeeId) return
      const { data, error } = await supabase
        .from('time_entries')
        .insert({
          employee_id: employeeId,
          entity: input.entity,
          clock_in: input.clock_in,
          clock_out: input.clock_out,
          break_minutes: input.break_minutes,
          notes: input.notes,
          is_manual: true,
          is_approved: false,
          clock_in_location: null,
          clock_out_location: null,
        })
        .select('*')
        .single()
      if (error) {
        setError(error.message)
        return
      }
      setEntries(prev =>
        [data, ...prev].sort(
          (a, b) => new Date(b.clock_in).getTime() - new Date(a.clock_in).getTime(),
        ),
      )
      await logAudit('manual_entry', 'time_entry', data.id, {
        entity: data.entity,
        clock_in: data.clock_in,
        clock_out: data.clock_out,
      })
    },
    [employeeId, logAudit],
  )

  const todaysEntries = useMemo(() => {
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return entries.filter(e => {
      const t = new Date(e.clock_in).getTime()
      return t >= start.getTime() && t < end.getTime()
    })
  }, [entries])

  return {
    activeSession,
    entries,
    todaysEntries,
    loading,
    error,
    clockIn,
    clockOut,
    switchEntity,
    startBreak,
    endBreak,
    updateNotes,
    updateEntryNotes,
    deleteEntry,
    addManualEntry,
    refresh: loadAll,
  }
}
