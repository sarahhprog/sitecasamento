import { createClient } from '@supabase/supabase-js'

let client

function getKeyRole(serviceRoleKey) {
  const parts = serviceRoleKey.split('.')
  if (parts.length !== 3) return null

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Pagamentos indisponíveis: configure a conexão privada do Supabase no servidor.')
  }

  const keyRole = getKeyRole(serviceRoleKey)
  if ((keyRole && keyRole !== 'service_role') || serviceRoleKey.startsWith('sb_publishable_')) {
    const error = new Error('A chave privada do Supabase não possui o papel service_role.')
    error.code = 'SUPABASE_SERVER_ROLE_REQUIRED'
    throw error
  }

  if (!client) {
    client = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  }

  return client
}