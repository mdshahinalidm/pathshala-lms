/**
 * Student class taxonomy + profile completion — shared by client & server.
 *
 * Every student picks their class at REGISTRATION (required) and can update
 * it from their profile. Admin broadcast targets one or more of these keys,
 * and the admin Students page filters by them.
 */

export type ClassKey =
  | 'CLASS_9'
  | 'CLASS_10'
  | 'CLASS_11'
  | 'CLASS_12'
  | 'HONOURS_1ST'
  | 'HONOURS_2ND'
  | 'HONOURS_3RD'
  | 'HONOURS_4TH'
  | 'OTHER'

export interface ClassOption {
  value: ClassKey
  bn: string
  en: string
}

export const CLASS_OPTIONS: ClassOption[] = [
  { value: 'CLASS_9', bn: 'নবম শ্রেণি', en: 'Class 9' },
  { value: 'CLASS_10', bn: 'দশম শ্রেণি', en: 'Class 10' },
  { value: 'CLASS_11', bn: 'একাদশ শ্রেণি', en: 'Class 11' },
  { value: 'CLASS_12', bn: 'দ্বাদশ শ্রেণি', en: 'Class 12' },
  { value: 'HONOURS_1ST', bn: 'সম্মান ১ম বর্ষ', en: 'Honours 1st Year' },
  { value: 'HONOURS_2ND', bn: 'সম্মান ২য় বর্ষ', en: 'Honours 2nd Year' },
  { value: 'HONOURS_3RD', bn: 'সম্মান ৩য় বর্ষ', en: 'Honours 3rd Year' },
  { value: 'HONOURS_4TH', bn: 'সম্মান ৪র্থ বর্ষ', en: 'Honours 4th Year' },
  { value: 'OTHER', bn: 'অন্যান্য', en: 'Other' },
]

const CLASS_MAP = new Map(CLASS_OPTIONS.map((c) => [c.value, c]))

export function isValidClass(v: unknown): v is ClassKey {
  return typeof v === 'string' && CLASS_MAP.has(v as ClassKey)
}

/** Bilingual label — falls back to the raw key for unknown/legacy values. */
export function classLabel(v: string | null | undefined, lang: 'bn' | 'en'): string {
  if (!v) return lang === 'bn' ? 'নির্ধারিত নয়' : 'Not set'
  const opt = CLASS_MAP.get(v as ClassKey)
  if (!opt) return v
  return lang === 'bn' ? opt.bn : opt.en
}

/** Parse the JSON array stored in Broadcast.targetClasses. */
export function parseTargetClasses(json: string | null | undefined): ClassKey[] {
  if (!json) return []
  try {
    const arr: unknown = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return arr.filter(isValidClass)
  } catch {
    return []
  }
}

// ───────────────────────── PROFILE COMPLETION ─────────────────────────
// A student must reach 100% before BUYING (paid courses + paid suggestions).
// Fields: name · email · phone · class · institution · avatar photo.

export interface ProfileLike {
  name?: string | null
  email?: string | null
  phone?: string | null
  studentClass?: string | null
  institution?: string | null
  avatarUrl?: string | null
}

export const PROFILE_FIELD_LABELS: Record<string, { bn: string; en: string }> = {
  name: { bn: 'নাম', en: 'Name' },
  email: { bn: 'ইমেইল', en: 'Email' },
  phone: { bn: 'ফোন নম্বর', en: 'Phone number' },
  studentClass: { bn: 'শ্রেণি/বর্ষ', en: 'Class / year' },
  institution: { bn: 'স্কুল/কলেজের নাম', en: 'School / college name' },
  avatarUrl: { bn: 'প্রোফাইল ছবি', en: 'Profile photo' },
}

export const TOTAL_PROFILE_FIELDS = Object.keys(PROFILE_FIELD_LABELS).length // 6

/** Missing profile fields (ordered for UI hints). */
export function missingProfileFields(u: ProfileLike): string[] {
  const missing: string[] = []
  if (!u.name?.trim()) missing.push('name')
  if (!u.email?.trim()) missing.push('email')
  if (!u.phone?.trim()) missing.push('phone')
  if (!u.studentClass) missing.push('studentClass')
  if (!u.institution?.trim()) missing.push('institution')
  if (!u.avatarUrl?.trim()) missing.push('avatarUrl')
  return missing
}

/** 0–100 integer completion percent. */
export function profileCompletion(u: ProfileLike): number {
  const missing = missingProfileFields(u)
  return Math.round(((TOTAL_PROFILE_FIELDS - missing.length) / TOTAL_PROFILE_FIELDS) * 100)
}

export function isProfileComplete(u: ProfileLike): boolean {
  return missingProfileFields(u).length === 0
}
