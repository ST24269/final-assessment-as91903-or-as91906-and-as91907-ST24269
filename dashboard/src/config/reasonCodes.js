export const REASON_CODES = [
  { value: 'sick', label: 'Sick' },
  { value: 'approved_leave', label: 'Approved leave' },
  { value: 'school_activity', label: 'School activity' },
  { value: 'technical_issue', label: 'Technical issue' },
  { value: 'late', label: 'Late' },
  { value: 'other', label: 'Other' },
]

export function reasonCodeLabel(value) {
  return REASON_CODES.find((item) => item.value === value)?.label || null
}
