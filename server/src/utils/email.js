const path = require('path')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true })

const VERIFIED_RESEND_FROM_EXAMPLE = 'Tago <attendance@notquiteprod.tech>'
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
  console.info(`[email] EMAIL_FROM loaded: ${from ? 'yes' : 'no'}`)
  console.info(`[email] Recipient count: ${recipients.length}`)
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

async function getProviderError(response, provider) {
  const body = await response.text()
  console.warn(`[email] ${provider} provider error ${response.status}: ${body || response.statusText}`)
  return `Email provider rejected the request (${response.status}). Check server email configuration.`
}

async function sendWithResend({ from, recipients, subject, text, html }) {
  const startTime = Date.now()
  const timestamp = new Date().toISOString()

  console.log(`[email] [${timestamp}] RESEND: Attempting to send email`)
  console.log(`[email]   From: ${from}`)
  console.log(`[email]   To: ${JSON.stringify(recipients)}`)
  console.log(`[email]   Subject: ${subject}`)

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

  const duration = Date.now() - startTime
  const responseBody = await response.text()

  console.log(`[email]   Resend response status: ${response.status}`)
  console.log(`[email]   Resend response body: ${responseBody}`)
  console.log(`[email]   Response time: ${duration}ms`)

  if (!response.ok) {
    const errorMsg = `Resend API error (${response.status}): ${responseBody}`
    console.error(`[email]   ERROR: ${errorMsg}`)
    return { sent: false, error: errorMsg, provider: 'resend' }
  }

  // Parse response to get message ID
  let messageId = null
  try {
    const jsonResponse = JSON.parse(responseBody)
    messageId = jsonResponse.id || null
    console.log(`[email]   Message ID: ${messageId}`)
  } catch (e) {
    console.warn(`[email]   Could not parse Resend response: ${e.message}`)
  }

  console.log(`[email]   ✅ Email accepted by Resend (ID: ${messageId})`)
  return { sent: true, provider: 'resend', messageId, timestamp }
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
    return { sent: false, error: await getProviderError(response, 'sendgrid'), provider: 'sendgrid' }
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
    return { sent: false, error: await getProviderError(response, 'webhook'), provider: 'webhook' }
  }

  return { sent: true, provider: 'webhook' }
}

async function sendEmail({ to = getRecipient(), subject, text, html }) {
  const recipients = normalizeRecipients(to)
  const from = getFromHeader()
  const provider = getSelectedProvider()

  // Enhanced logging for debugging
  console.log('[email] ============================================')
  console.log('[email] sendEmail() called')
  console.log('[email] TO:', JSON.stringify(recipients))
  console.log('[email] FROM:', from)
  console.log('[email] SUBJECT:', subject)
  console.log('[email] PROVIDER:', provider)
  console.log('[email] RESEND_API_KEY present:', Boolean(getEnv('RESEND_API_KEY')))
  console.log('[email] SENDGRID_API_KEY present:', Boolean(getEnv('SENDGRID_API_KEY')))
  console.log('[email] EMAIL_FROM:', getEnv('EMAIL_FROM'))
  console.log('[email] SUPPORT_EMAIL:', getEnv('SUPPORT_EMAIL'))
  console.log('[email] ============================================')

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
    console.error('[email] FROM header validation failed:', fromError)
    const result = { sent: false, error: fromError }
    logEmailResult(result)
    return result
  }

  const recipientError = validateRecipients(recipients)
  if (recipientError) {
    console.error('[email] Recipient validation failed:', recipientError)
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
      console.log('[email] Attempting to send via Resend...')
      result = await sendWithResend({ from, recipients, subject, text, html })
      logEmailResult(result)
      return result
    }

    if (provider === 'sendgrid') {
      console.log('[email] Attempting to send via SendGrid...')
      result = await sendWithSendGrid({ recipients, subject, text, html })
      logEmailResult(result)
      return result
    }

    if (provider === 'webhook') {
      console.log('[email] Attempting to send via Webhook...')
      result = await sendWithWebhook({ from, recipients, subject, text, html })
      logEmailResult(result)
      return result
    }
  } catch (error) {
    console.error(`[email] Provider request failed with exception:`, error)
    const result = {
      sent: false,
      error: 'Email provider request failed. Check server email configuration.',
    }
    logEmailResult(result)
    return result
  }

  const result = { sent: false, error: 'Email provider could not be selected.' }
  logEmailResult(result)
  return result
}

// Test function to verify email configuration
async function testEmailConfig() {
  console.log('[email] Testing email configuration...')
  console.log('[email] ============================================')
  console.log('[email] Testing getEnv():')
  console.log('[email]   RESEND_API_KEY:', getEnv('RESEND_API_KEY') ? 'set (length: ' + getEnv('RESEND_API_KEY').length + ')' : 'NOT SET')
  console.log('[email]   SENDGRID_API_KEY:', getEnv('SENDGRID_API_KEY') ? 'set' : 'NOT SET')
  console.log('[email]   EMAIL_FROM:', getEnv('EMAIL_FROM') || 'NOT SET')
  console.log('[email]   EMAIL_FROM_ADDRESS:', getEnv('EMAIL_FROM_ADDRESS') || 'NOT SET')
  console.log('[email]   SUPPORT_EMAIL:', getEnv('SUPPORT_EMAIL') || 'NOT SET')
  console.log('[email]   MAIL_WEBHOOK_URL:', getEnv('MAIL_WEBHOOK_URL') ? 'set' : 'NOT SET')
  console.log('[email] ============================================')
  console.log('[email] Testing provider selection:')
  const provider = getSelectedProvider()
  console.log('[email]   Selected provider:', provider)
  console.log('[email] ============================================')
  console.log('[email] Testing FROM header:')
  const from = getFromHeader()
  console.log('[email]   FROM:', from)
  const fromError = validateFromHeader(from)
  console.log('[email]   Validation:', fromError || 'OK')
  console.log('[email] ============================================')

  // Test sending a simple email
  console.log('[email] Testing sendEmail()...')
  const testResult = await sendEmail({
    to: getEnv('SUPPORT_EMAIL'),
    subject: 'Tago Email System Test',
    text: 'This is a test email from the Tago server. If you receive this, email sending is working!',
  })
  console.log('[email] Test result:', testResult)
  console.log('[email] ============================================')

  return testResult
}

module.exports = {
  isEmailConfigured,
  isValidEmailAddress,
  sendEmail,
  testEmailConfig,
}
