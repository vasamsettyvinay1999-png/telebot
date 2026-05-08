import type { ParsedResume } from './parser.service.js';

export interface ValidationResult {
  isValid: boolean;
  violations: string[];
}

export function validateResumeIntegrity(
  original: ParsedResume,
  generated: ParsedResume,
): ValidationResult {
  const violations: string[] = [];
  if (generated.experience.length > original.experience.length) {
    violations.push('role_added');
  }
  const minLen = Math.min(original.experience.length, generated.experience.length);
  for (let i = 0; i < minLen; i += 1) {
    if (generated.experience[i]?.title !== original.experience[i]?.title) {
      violations.push(`title_changed_${i}`);
    }
    if (generated.experience[i]?.startDate !== original.experience[i]?.startDate) {
      violations.push(`start_date_changed_${i}`);
    }
    if (generated.experience[i]?.endDate !== original.experience[i]?.endDate) {
      violations.push(`end_date_changed_${i}`);
    }
  }
  return { isValid: violations.length === 0, violations };
}

