export type Profile = {
  id: string
  auth_user_id: string | null
  email: string
  full_name: string | null
  role: 'admin' | 'sub_admin' | 'tutor' | 'mentor' | 'student'
  status: 'active' | 'pending' | 'disabled'
  class_level: string | null
}
