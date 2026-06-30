const path = require('path')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true })

const VERIFIED_RESEND_FROM_EXAMPLE = 'AttendRFID <attendance@notquiteprod.tech>'
const UNVERIFIED_RESEND_APP_SUFFIX = '.resend.app'
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

function getEnv(name) {
  return process.env[name]?.trim() || ''
}

function extractEmailAddress(value) {
  const trimmed = String(value || '').trim()
  const bracketMatch = trimmed.match(/<([^>]+)>/)
  return (bracketMatch?.[1] || trimmed).trim()
}

function isValidEmailAddress(value) {
  return EMAIL_PATTERN.test(String(value || '').trim())
}

function normalizeRecipients(to) {
  if (Array.isArray(to)) {
    return to.map((recipient) => String(recipient).trim()).filter(Boolean)
  }

  return String(to || '')
    .split(',')
    .map((recipient) => recipient.trim())
    .filter(Boolean)
}

function getRecipient() {
  return getEnv('SUPPORT_EMAIL') || getEnv('ADMIN_EMAIL') || getEnv('MAIL_TO')
}

function isEmailConfigured() {
  return Boolean(
    getEnv('RESEND_API_KEY') ||
    getEnv('SENDGRID_API_KEY') ||
    getEnv('MAIL_WEBHOOK_URL')
  )
}

function getFromHeader() {
  return getEnv('EMAIL_FROM')
}

function getSendGridFromEmail() {
  const configuredAddress = getEnv('EMAIL_FROM_ADDRESS')
  if (configuredAddress) return configuredAddress

  return extractEmailAddress(getFromHeader())
}

function getSelectedProvider() {
  if (getEnv('RESEND_API_KEY')) return 'resend'
  if (getEnv('SENDGRID_API_KEY')) return 'sendgrid'
  if (getEnv('MAIL_WEBHOOK_URL')) return 'webhook'
  return null
}

function logEmailConfig({ provider, from, recipients }) {
  console.info(`[email] RESEND_API_KEY loaded: ${getEnv('RESEND_API_KEY') ? 'yes' : 'no'}`)
  console.info(`[email] EMAIL_FROM: ${from || '(missing)'}`)
  console.info(`[email] Recipient email(s): ${recipients.length ? recipients.join(', ') : '(missing)'}`)
  console.info(`[email] Provider selected: ${provider || 'none'}`)
}

function logEmailResult(result) {
  console.info(`[email] Result: ${result.sent ? `sent via ${result.provider}` : `not sent - ${result.error}`}`)
}

function validateFromHeader(from) {
  if (!from) {
    return `EMAIL_FROM is missing. Set EMAIL_FROM=${VERIFIED_RESEND_FROM_EXAMPLE} in server/.env.`
  }

  const fromEmail = extractEmailAddress(from)

  if (!isValidEmailAddress(fromEmail)) {
    return `EMAIL_FROM is invalid. Use EMAIL_FROM=${VERIFIED_RESEND_FROM_EXAMPLE} in server/.env.`
  }

  if (fromEmail.toLowerCase().endsWith(UNVERIFIED_RESEND_APP_SUFFIX)) {
    return `EMAIL_FROM uses an unverified Resend app domain. Set EMAIL_FROM=${VERIFIED_RESEND_FROM_EXAMPLE} or another verified sender.`
  }

  return null
}

function validateRecipients(recipients) {
  if (!recipients.length) {
    return 'Recipient email is missing or not configured.'
  }

  const invalidRecipient = recipients.find((recipient) => !isValidEmailAddress(recipient))

  if (invalidRecipient) {
    return `Recipient email is invalid: ${invalidRecipient}`
  }

  return null
}

async function getProviderError(response) {
  const body = await response.text()
  return body || `${response.status} ${response.statusText}`.trim()
}

async function sendWithResend({ from, recipients, subject, text, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getEnv('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      text,
      html,
    }),
  })

  if (!response.ok) {
    return { sent: false, error: await getProviderError(response), provider: 'resend' }
  }

  return { sent: true, provider: 'resend' }
}

async function sendWithSendGrid({ recipients, subject, text, html }) {
  const content = []

  if (text) content.push({ type: 'text/plain', value: text })
  if (html) content.push({ type: 'text/html', value: html })

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getEnv('SENDGRID_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: recipients.map((email) => ({ email })) }],
      from: { email: getSendGridFromEmail() },
      subject,
      content,
    }),
  })

  if (!response.ok) {
    return { sent: false, error: await getProviderError(response), provider: 'sendgrid' }
  }

  return { sent: true, provider: 'sendgrid' }
}

async function sendWithWebhook({ from, recipients, subject, text, html }) {
  const response = await fetch(getEnv('MAIL_WEBHOOK_URL'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: recipients,
      from,
      subject,
      text,
      html,
    }),
  })

  if (!response.ok) {
    return { sent: false, error: await getProviderError(response), provider: 'webhook' }
  }

  return { sent: true, provider: 'webhook' }
}

async function sendEmail({ to = getRecipient(), subject, text, html }) {
  const recipients = normalizeRecipients(to)
  const from = getFromHeader()
  const provider = getSelectedProvider()

  logEmailConfig({ provider, from, recipients })

  if (!provider) {
    const result = {
      sent: false,
      error: 'RESEND_API_KEY is missing from server/.env, and no SendGrid or webhook email service is configured.',
    }
    logEmailResult(result)
    return result
  }

  if (provider === 'resend' && !getEnv('RESEND_API_KEY')) {
    const result = { sent: false, error: 'RESEND_API_KEY is missing from server/.env.' }
    logEmailResult(result)
    return result
  }

  const fromError = validateFromHeader(from)
  if (fromError) {
    const result = { sent: false, error: fromError }
    logEmailResult(result)
    return result
  }

  const recipientError = validateRecipients(recipients)
  if (recipientError) {
    const result = { sent: false, error: recipientError }
    logEmailResult(result)
    return result
  }

  if (!subject || (!text && !html)) {
    const result = { sent: false, error: 'Email subject and content are required.' }
    logEmailResult(result)
    return result
  }

  if (typeof fetch !== 'function') {
    const result = { sent: false, error: 'Email sending requires fetch support in the Node.js runtime.' }
    logEmailResult(result)
    return result
  }

  try {
    let result

    if (provider === 'resend') {
      result = await sendWithResend({ from, recipients, subject, text, html })
      logEmailResult(result)
      return result
    }

    if (provider === 'sendgrid') {
      result = await sendWithSendGrid({ recipients, subject, text, html })
      logEmailResult(result)
      return result
    }

    if (provider === 'webhook') {
      result = await sendWithWebhook({ from, recipients, subject, text, html })
      logEmailResult(result)
      return result
    }
  } catch (error) {
    const result = {
      sent: false,
      error: error.message || 'Email provider request failed.',
    }
    logEmailResult(result)
    return result
  }

  const result = { sent: false, error: 'Email provider could not be selected.' }
  logEmailResult(result)
  return result
}

module.exports = {
  isEmailConfigured,
  isValidEmailAddress,
  sendEmail,
}
