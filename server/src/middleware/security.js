const crypto = require('crypto')
const { normalizeOrigin } = require('../config/env')

function attachRequestId(req, res, next) {
  req.requestId = crypto.randomUUID()
  res.setHeader('X-Request-ID', req.requestId)
  next()
}

function applySecurityHeaders({ isProduction = false } = {}) {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
    res.setHeader('Cache-Control', 'no-store')

    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
    }

    next()
  }
}

function protectErrorResponses(req, res, next) {
  const originalJson = res.json.bind(res)

  res.json = (body) => {
    const isObject = body && typeof body === 'object' && !Array.isArray(body)

    if (res.statusCode >= 500 && isObject && typeof body.error === 'string') {
      if (!body.requestId) {
        console.error(`[api] ${req.requestId} ${req.method} ${req.originalUrl} -> ${res.statusCode}: ${body.error}`)
      }

      return originalJson({
        error: 'Something went wrong while processing this request.',
        requestId: req.requestId,
      })
    }

    if (res.statusCode >= 400 && isObject && !body.requestId) {
      return originalJson({ ...body, requestId: req.requestId })
    }

    return originalJson(body)
  }

  next()
}

function createCorsOptions(allowedOrigins) {
  const allowed = new Set(allowedOrigins.map(normalizeOrigin).filter(Boolean))

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true)
        return
      }

      const normalized = normalizeOrigin(origin)
      if (allowed.has(normalized)) {
        callback(null, true)
        return
      }

      const error = new Error('CORS origin not allowed')
      error.status = 403
      error.publicMessage = 'This browser origin is not allowed to use the Tago API.'
      callback(error)
    },
  }
}

function createRateLimiter({
  windowMs,
  max,
  message = 'Too many requests. Try again soon.',
  keyGenerator = (req) => req.ip || 'unknown',
}) {
  const buckets = new Map()

  return (req, res, next) => {
    const now = Date.now()
    const key = keyGenerator(req)
    const existing = buckets.get(key)
    const bucket = existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowMs }

    bucket.count += 1
    buckets.set(key, bucket)

    if (buckets.size > 10000) {
      for (const [bucketKey, value] of buckets.entries()) {
        if (value.resetAt <= now) buckets.delete(bucketKey)
      }
    }

    res.setHeader('RateLimit-Limit', String(max))
    res.setHeader('RateLimit-Remaining', String(Math.max(max - bucket.count, 0)))
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > max) {
      res.status(429).json({ error: message })
      return
    }

    next()
  }
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'API route not found.',
    requestId: req.requestId,
  })
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error)
    return
  }

  const status = Number(error.status || error.statusCode) || 500
  const safeStatus = status >= 400 && status < 600 ? status : 500
  const publicMessage = error.type === 'entity.parse.failed'
    ? 'Request body must be valid JSON.'
    : safeStatus >= 500
    ? 'Something went wrong while processing this request.'
    : (error.publicMessage || error.message || 'Request failed.')

  console.error(`[api] ${req.requestId} ${req.method} ${req.originalUrl} -> ${safeStatus}: ${error.message}`)

  res.status(safeStatus).json({
    error: publicMessage,
    requestId: req.requestId,
  })
}

module.exports = {
  applySecurityHeaders,
  attachRequestId,
  createCorsOptions,
  createRateLimiter,
  errorHandler,
  notFoundHandler,
  protectErrorResponses,
}
