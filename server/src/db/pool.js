const { createClient } = require('@supabase/supabase-js')
const { validateServerEnv } = require('../config/env')

const { supabaseUrl, supabaseServiceKey } = validateServerEnv()

const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
)

module.exports = supabase
