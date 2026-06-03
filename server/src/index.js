require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/students', require('./routes/students'))
app.use('/api/sessions', require('./routes/sessions'))
app.use('/api/attendance', require('./routes/attendance'))
app.use('/api/users', require('./routes/users'))

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})