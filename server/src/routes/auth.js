const express = require('express')
const router = express.Router()
const supabase = require('../db/pool')
const { isValidEmailAddress, sendEmail } = require('../utils/email')

const SAFE_RESET_MESSAGE = 'If an account exists for this email, a password reset link has been sent.'

function getFrontendUrl() {
  return (
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    process.env.APP_URL ||
    'http://localhost:5173'
  ).replace(/\/+$/, '')
}

function isProduction() {
  return process.env.NODE_ENV === 'production'
}

function sendResetResponse(res, status, error) {
  if (isProduction()) {
    return res.status(200).json({ success: true, message: SAFE_RESET_MESSAGE })
  }

  if (error) {
    return res.status(status).json({ error })
  }

  return res.status(200).json({ success: true, message: SAFE_RESET_MESSAGE })
}

router.post('/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()

  if (!isValidEmailAddress(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' })
  }

  const redirectTo = `${getFrontendUrl()}/reset-password`

  try {
    const { data, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })

    if (linkError) {
      console.error('[auth] Password reset link generation failed:', linkError.message)
      return sendResetResponse(res, 500, `Could not generate reset link: ${linkError.message}`)
    }

    const resetLink = data?.properties?.action_link

    if (!resetLink) {
      console.error('[auth] Password reset link generation returned no action_link.')
      return sendResetResponse(res, 500, 'Could not generate reset link.')
    }

    const emailResult = await sendEmail({
      to: email,
      subject: 'Reset your AttendRFID password',
      text: [
        'Kia ora,',
        '',
        'Use this link to reset your AttendRFID password:',
        resetLink,
        '',
        'This link expires automatically. If you did not request this, you can ignore this email.',
      ].join('\n'),
    })

    console.info(`[auth] Forgot password email result: ${emailResult.sent ? 'sent' : `not sent - ${emailResult.error}`}`)

    if (!emailResult.sent) {
      return sendResetResponse(res, 502, `Password reset email was not sent: ${emailResult.error}`)
    }

    return res.json({
      success: true,
      message: SAFE_RESET_MESSAGE,
    })
  } catch (error) {
    console.error('[auth] Unexpected forgot-password error:', error)
    return sendResetResponse(res, 500, error.message || 'Could not send password reset email.')
  }
})

module.exports = router
