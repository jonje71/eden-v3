-- EDEN v3 Production Database Schema & Row-Level Security (RLS)
-- Copy and paste this script into your Supabase SQL Editor (https://app.supabase.com)

-- 1. Create Teachers Profile Table
CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  serial_number TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  school_name TEXT DEFAULT 'Unassigned School Hub',
  department_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Students Master Table
CREATE TABLE IF NOT EXISTS public.students (
  id BIGSERIAL PRIMARY KEY,
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  sex VARCHAR(2) NOT NULL CHECK (sex IN ('M', 'F')),
  grade_section TEXT,
  lrn VARCHAR(12),
  is_enriched BOOLEAN DEFAULT FALSE,
  added_by_serial TEXT NOT NULL,
  department_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Department Guilds Table
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by_serial TEXT NOT NULL,
  paired_serials TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Drop Existing Policies if any (Prevents duplicate policy error)
DROP POLICY IF EXISTS "Teachers can view and edit their own profile" ON public.teachers;
DROP POLICY IF EXISTS "Teachers can view and edit their own students" ON public.students;
DROP POLICY IF EXISTS "Teachers can view department guild students" ON public.students;
DROP POLICY IF EXISTS "Teachers can view and manage their department guilds" ON public.departments;

-- Create RLS Policies
CREATE POLICY "Teachers can view and edit their own profile" 
  ON public.teachers FOR ALL USING (auth.uid() = id);

CREATE POLICY "Teachers can view and edit their own students" 
  ON public.students FOR ALL USING (
    added_by_serial = (SELECT serial_number FROM public.teachers WHERE id = auth.uid())
  );

CREATE POLICY "Teachers can view department guild students" 
  ON public.students FOR SELECT USING (
    department_id IN (
      SELECT id FROM public.departments 
      WHERE (SELECT serial_number FROM public.teachers WHERE id = auth.uid()) = ANY(paired_serials)
         OR created_by_serial = (SELECT serial_number FROM public.teachers WHERE id = auth.uid())
    )
  );

CREATE POLICY "Teachers can view and manage their department guilds" 
  ON public.departments FOR ALL USING (
    created_by_serial = (SELECT serial_number FROM public.teachers WHERE id = auth.uid())
    OR (SELECT serial_number FROM public.teachers WHERE id = auth.uid()) = ANY(paired_serials)
  );
