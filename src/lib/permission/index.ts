/**
 * Single import surface for every permission/authorization decision in the
 * app. Domain services and Server Actions/Route Handlers should import from
 * here rather than reaching into individual auth/permission files directly.
 */
export { canManageClass, canManageScope, canAccessClass } from './class'
export { canMentor } from './mentor'
export { canWriteClass } from './class-write'
export { teachesClass } from '@/lib/auth/class-scope'
