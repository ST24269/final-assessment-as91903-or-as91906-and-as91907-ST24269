const express = require('express')
const cors = require('cors')
const { validateServerEnv } = require('./config/env')
const { testEmailConfig } = require('./utils/email')
const {
  applySecurityHeaders,
  attachRequestId,
  createCorsOptions,
  createRateLimiter,
  errorHandler,
  notFoundHandler,
  protectErrorResponses,
} = require('./middleware/security')

const app = express()
const config = validateServerEnv()
const PORT = config.port

app.disable('x-powered-by')
if (config.isProduction) app.set('trust proxy', 1)
app.use(attachRequestId)
app.use(applySecurityHeaders({ isProduction: config.isProduction }))
app.use(protectErrorResponses)
app.use(cors(createCorsOptions(config.corsOrigins)))
app.use(express.json({ limit: '1mb' }))
app.use('/api/auth/forgot-password', createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Too many password reset attempts. Try again later.',
}))
app.use('/api/attendance/scan', createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many RFID scan requests. Try again shortly.',
}))
app.use('/api', createRateLimiter({
  windowMs: 60 * 1000,
  max: 240,
}))

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  })
})

// DEBUG endpoint to test email configuration
app.get('/api/debug/email-test', async (req, res) => {
  try {
    const result = await testEmailConfig()
    res.json({
      success: result.sent,
      error: result.sent ? null : result.error,
      provider: result.provider,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    })
  }
})

app.use('/api/auth', require('./routes/auth'))
app.use('/api/students', require('./routes/students'))
app.use('/api/sessions', require('./routes/sessions'))
app.use('/api/attendance', require('./routes/attendance'))
app.use('/api/users', require('./routes/users'))
app.use('/api/appeals', require('./routes/appeals'))
app.use('/api/timetable', require('./routes/timetable'))
app.use('/api/classes', require('./routes/classes'))
const readersRouter = require('./routes/readers')
app.use('/api/readers', readersRouter)
app.use('/api/onboarding', require('./routes/onboarding'))
app.use('/api/settings', require('./routes/settings'))
app.use('/api/errors', require('./routes/errors'))
app.use('/api/notifications', require('./routes/notifications'))
app.use('/api/feedback', require('./routes/feedback'))
app.use('/api/emergency', require('./routes/emergency'))

app.use(notFoundHandler)
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)

  if (!config.isProduction) {
    console.log(`Allowed CORS origins: ${config.corsOrigins.join(', ')}`)
  }

  setInterval(() => {
    readersRouter.checkReaderHealth().catch((error) => {
      console.error('[reader-health] Sweep failed:', error.message)
    })
  }, 60 * 1000)
})
