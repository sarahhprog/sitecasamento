import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { safeErrorDetails } from '../_lib/safeErrorDetails.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function handler(req, res, dependencies = {}) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido.' })
  }

  const purchaseId = typeof req.query?.id === 'string' ? req.query.id : ''
  if (!UUID_PATTERN.test(purchaseId)) {
    return res.status(400).json({ error: 'Identificador de pagamento inválido.' })
  }

  try {
    const { data, error } = await (dependencies.getSupabaseAdmin || getSupabaseAdmin)()
      .from('gift_payments')
      .select('payment_status,reservation_expires_at')
      .eq('idempotency_key', purchaseId)
      .maybeSingle()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Pagamento não encontrado.' })

    const reservationExpired = data.reservation_expires_at
      && new Date(data.reservation_expires_at).getTime() <= Date.now()
    const status = reservationExpired && data.payment_status === 'pending'
      ? 'expired'
      : data.payment_status

    return res.status(200).json({ status })
  } catch (error) {
    console.error('Erro ao consultar status do pagamento:', {
      stage: 'supabase_payment_status_lookup',
      operation: 'read_payment_status_by_idempotency_key',
      ...safeErrorDetails(error),
    })
    return res.status(503).json({ error: 'Status do pagamento indisponível.' })
  }
}