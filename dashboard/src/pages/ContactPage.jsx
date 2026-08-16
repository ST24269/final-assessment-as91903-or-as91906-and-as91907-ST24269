import { useState } from 'react'
import { Send } from 'lucide-react'
import PublicSiteLayout from '../components/PublicSiteLayout'
import Reveal from '../components/Reveal'
import { api } from '../api/client'

function defaultForm() {
  return { name: '', email: '', message: '' }
}

export default function ContactPage() {
  const [form, setForm] = useState(defaultForm())
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState(null)

  const submit = async (event) => {
    event.preventDefault()

    if (!form.email.trim() || !form.message.trim()) {
      setNotice({ type: 'error', text: 'Enter your email and a message.' })
      return
    }

    setSubmitting(true)
    setNotice(null)

    const data = await api.post('/api/feedback', form)
    setSubmitting(false)

    if (data?.error) {
      setNotice({ type: 'error', text: data.error })
      return
    }

    setForm(defaultForm())
    setNotice({ type: 'success', text: 'Thanks - your message has been sent.' })
  }

  return (
    <PublicSiteLayout>
      <main className="vivid-main vivid-docs">
        <section className="vivid-doc-hero">
          <Reveal as="p" className="vivid-eyebrow">Get in touch</Reveal>
          <Reveal as="h1" className="vivid-display-sm" delay={60}>
            Send feedback
          </Reveal>
          <Reveal as="p" className="vivid-body" delay={120}>
            Found a bug, or have an idea that would make Tago better? Send a message and it
            goes straight through.
          </Reveal>
        </section>

        <Reveal className="vivid-contact-card" delay={160}>
          <form className="account-form" onSubmit={submit}>
            <div className="login-field">
              <label htmlFor="contact-name">Name (optional)</label>
              <input
                id="contact-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Your name"
              />
            </div>
            <div className="login-field">
              <label htmlFor="contact-reply-email">Your email</label>
              <input
                id="contact-reply-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="you@example.com"
              />
            </div>
            <div className="login-field">
              <label htmlFor="contact-message">Message</label>
              <textarea
                id="contact-message"
                value={form.message}
                onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                placeholder="What's on your mind?"
                rows={6}
              />
            </div>

            {notice && (
              <p className={`action-notice ${notice.type === 'error' ? 'is-error' : 'is-success'}`}>
                {notice.text}
              </p>
            )}

            <button type="submit" disabled={submitting}>
              <Send size={16} strokeWidth={2.2} />
              {submitting ? 'Sending...' : 'Send message'}
            </button>
          </form>
        </Reveal>
      </main>
    </PublicSiteLayout>
  )
}
