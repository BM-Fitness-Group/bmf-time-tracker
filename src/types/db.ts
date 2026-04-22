export type EntityName = 'Corporate' | 'Plano' | 'Dallas'
export type Role = 'employee' | 'admin'

export type GeoPoint = {
  lat: number
  lng: number
  accuracy?: number
}

export type Employee = {
  id: string
  auth_user_id: string | null
  email: string
  full_name: string
  role: Role
  is_active: boolean
  created_at: string
}

export type TimeEntry = {
  id: string
  employee_id: string
  entity: EntityName
  clock_in: string
  clock_out: string | null
  break_minutes: number
  notes: string
  is_manual: boolean
  is_approved: boolean
  clock_in_location: GeoPoint | null
  clock_out_location: GeoPoint | null
  created_at: string
  updated_at: string
}

export type ActiveSession = {
  employee_id: string
  entity: EntityName
  clock_in: string
  break_start: string | null
  break_minutes: number
  notes: string
  started_at: string
}

export type AuditLog = {
  id: string
  actor_id: string | null
  action: string
  target_type: string
  target_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export type WeeklyApproval = {
  id: string
  employee_id: string
  week_ending_date: string
  approved_by: string | null
  approved_at: string | null
  total_hours: number | null
  entity_breakdown: Partial<Record<EntityName, number>> | null
}

type InsertOf<T, K extends keyof T = never> = Omit<T, K | 'created_at'> & {
  created_at?: string
}

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12'
  }
  public: {
    Tables: {
      employees: {
        Row: Employee
        Insert: InsertOf<Employee, 'id'> & { id?: string }
        Update: Partial<Employee>
        Relationships: []
      }
      time_entries: {
        Row: TimeEntry
        Insert: Omit<TimeEntry, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<TimeEntry>
        Relationships: []
      }
      active_sessions: {
        Row: ActiveSession
        Insert: Omit<ActiveSession, 'started_at' | 'break_minutes'> & {
          started_at?: string
          break_minutes?: number
        }
        Update: Partial<ActiveSession>
        Relationships: []
      }
      audit_log: {
        Row: AuditLog
        Insert: InsertOf<AuditLog, 'id'> & { id?: string }
        Update: Partial<AuditLog>
        Relationships: []
      }
      weekly_approvals: {
        Row: WeeklyApproval
        Insert: Omit<WeeklyApproval, 'id'> & { id?: string }
        Update: Partial<WeeklyApproval>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
