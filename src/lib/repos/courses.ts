import { createClient } from '@/lib/supabase/server'

export type Course = {
  id: string
  name: string
  status: 'active' | 'archived'
  created_at: string
}

export async function listCourses(): Promise<Course[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('courses').select('*').order('name')
  if (error) throw new Error(`courses.list: ${error.message}`)
  return (data ?? []) as Course[]
}

export async function getCourse(id: string): Promise<Course | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('courses').select('*').eq('id', id).maybeSingle()
  return (data as Course) ?? null
}

export async function createCourse(name: string): Promise<Course> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('courses').insert({ name }).select('*').single()
  if (error) throw new Error(`courses.create: ${error.message}`)
  return data as Course
}

export async function setCourseStatus(id: string, status: 'active' | 'archived'): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('courses').update({ status }).eq('id', id)
  if (error) throw new Error(`courses.setStatus: ${error.message}`)
}

export async function renameCourse(id: string, name: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('courses').update({ name }).eq('id', id)
  if (error) throw new Error(`courses.rename: ${error.message}`)
}
