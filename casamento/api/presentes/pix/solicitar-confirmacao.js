import { safeErrorDetails } from '../../_lib/safeErrorDetails.js'
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function handler(req, res, dependencies = {}) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' })
  }

  const idempotencyKey = typeof req.body?.idempotencyKey === 'string'
    ? req.body.idempotencyKey.trim()
    : ''
  if (!UUID_PATTERN.test(idempotencyKey)) {
    return res.status(400).json({ error: 'Identificador da solicitação inválido.' })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY
    || !(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) {
    return res.status(503).json({ error: 'O registro PIX não está configurado no servidor.' })
  }

  try {
    const { data: result, error } = await (dependencies.getSupabaseAdmin || getSupabaseAdmin)()
      .rpc('request_pix_confirmation', { p_idempotency_key: idempotencyKey })
    if (error) throw error

    const messages = {
      requested: [200, 'Solicitação registrada. A confirmação depende da verificação do pagamento.'],
      already_requested: [200, 'Sua solicitação já está aguardando verificação.'],
      expired: [410, 'A reserva expirou. Atualize a lista e escolha outro presente.'],
      not_found: [404, 'Solicitação não encontrada.'],
      wrong_method: [409, 'Esta solicitação não corresponde a um pagamento PIX.'],
      not_pending: [409, 'Esta solicitação não pode mais ser atualizada.'],
    }
    const [status, message] = messages[result] || [503, 'Não foi possível registrar a solicitação PIX.']
    return res.status(status).json({ status: result, message })
  } catch (error) {
    console.error('Falha ao registrar solicitação de confirmação PIX:', {
      stage: 'supabase_pix_confirmation_request',
      operation: 'request_pix_confirmation',
      ...safeErrorDetails(error),
    })
    return res.status(503).json({ error: 'Não foi possível registrar a solicitação PIX agora.' })
  }
}
