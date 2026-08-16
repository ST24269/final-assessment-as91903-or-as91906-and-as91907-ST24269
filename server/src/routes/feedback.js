const express = require('express')
const router = express.Router()
const { sendEmail, isValidEmailAddress } = require('../utils/email')

const MAX_MESSAGE_LENGTH = 4000

// POST /api/feedback - public contact form. No auth: anyone on the public
// site (including logged-out visitors) can send a message.
router.post('/', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 200)
  const email = String(req.body.email || '').trim()
  const message = String(req.body.message || '').trim().slice(0, MAX_MESSAGE_LENGTH)

  if (!email || !isValidEmailAddress(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' })
  }

  if (!message) {
    return res.status(400).json({ error: 'Enter a message.' })
  }

  const emailResult = await sendEmail({
    subject: `[Tago] Feedback from ${name || email}`,
    text: [
      'New feedback submitted through the Tago contact page.',
      '',
      `From: ${name || 'Not provided'}`,
      `Reply-to: ${email}`,
      '',
      message,
    ].join('\n'),
  })

  if (!emailResult.sent) {
    return res.status(500).json({ error: emailResult.error })
  }

  res.json({ success: true })
})

module.exports = router
