import { ShieldAlert, X } from 'lucide-react'

// Shared confirm-before-you-act dialog. `tone: 'danger'` reuses the same
// red button styling as the rest of the app's destructive actions; anything
// less severe than that should stay 'default' rather than reaching for this
// at all - not every action needs a confirmation step.
export default function ConfirmDialog({
  eyebrow = 'Confirm',
  title,
  description,
  tone = 'default',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
  busy = false,
}) {
  return (
    <div className="student-modal-backdrop" role="presentation">
      <section className="student-modal student-modal-small" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="student-modal-header">
          <div>
            <p className="card-title">{eyebrow}</p>
            <h3 id="confirm-dialog-title">{title}</h3>
          </div>
          <button type="button" className="student-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>

        <div className="student-danger-copy">
          <ShieldAlert size={18} strokeWidth={2.2} />
          <p>{description}</p>
        </div>

        <div className="student-modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>{cancelLabel}</button>
          <button
            type="button"
            className={tone === 'danger' ? 'account-danger-button' : undefined}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
