/**
 * Auto-grading engine — marks in → letter grade + grade point out.
 *
 *  • CLASS 9-12  → Bangladesh board scale (GPA 5.00): 80+ A+ · 70 A · 60 A- ·
 *                  50 B · 40 C · 33 D · below 33 F.
 *  • HONOURS     → National University scale (GPA 4.00): 80+ A+ · 75 A ·
 *                  70 A- · 65 B+ · 60 B · 55 B- · 50 C+ · 45 C · 40 D · F.
 *
 * The Result Center's "publish" action runs these on the server so the
 * stored grade/GPA snapshot is identical for the admin sheet and the
 * student's result page.
 */

export interface GradeInfo {
  grade: string
  gpa: number
}

/** Class 9-12 board grading (percentage 0..100). */
export function boardGrade(percent: number): GradeInfo {
  if (percent >= 80) return { grade: 'A+', gpa: 5.0 }
  if (percent >= 70) return { grade: 'A', gpa: 4.0 }
  if (percent >= 60) return { grade: 'A-', gpa: 3.5 }
  if (percent >= 50) return { grade: 'B', gpa: 3.0 }
  if (percent >= 40) return { grade: 'C', gpa: 2.0 }
  if (percent >= 33) return { grade: 'D', gpa: 1.0 }
  return { grade: 'F', gpa: 0.0 }
}

/** National University honours grading (percentage 0..100). */
export function nuGrade(percent: number): GradeInfo {
  if (percent >= 80) return { grade: 'A+', gpa: 4.0 }
  if (percent >= 75) return { grade: 'A', gpa: 3.75 }
  if (percent >= 70) return { grade: 'A-', gpa: 3.5 }
  if (percent >= 65) return { grade: 'B+', gpa: 3.25 }
  if (percent >= 60) return { grade: 'B', gpa: 3.0 }
  if (percent >= 55) return { grade: 'B-', gpa: 2.75 }
  if (percent >= 50) return { grade: 'C+', gpa: 2.5 }
  if (percent >= 45) return { grade: 'C', gpa: 2.25 }
  if (percent >= 40) return { grade: 'D', gpa: 2.0 }
  return { grade: 'F', gpa: 0.0 }
}

/** Pick the right scale for a quiz level ('CLASS' | 'HONOURS'). */
export function gradeForLevel(level: string, percent: number): GradeInfo {
  return level === 'HONOURS' ? nuGrade(percent) : boardGrade(percent)
}

/** Round GPA to 2 decimals for display/storage. */
export function roundGpa(gpa: number): number {
  return Math.round(gpa * 100) / 100
}
