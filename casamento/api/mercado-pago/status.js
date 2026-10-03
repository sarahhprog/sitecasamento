import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido.' })
  }

  const purchaseId = typeof req.query?.id === 'string' ? req.query.id : ''
  if (!UUID_PATTERN.test(purchaseId)) {
    return res.status(400).json({ error: 'Identificador de pagamento inválido.' })
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('gift_payments')
      .select('payment_status')
      .eq('idempotency_key', purchaseId)
      .maybeSingle()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Pagamento não encontrado.' })

    return res.status(200).json({ status: data.payment_status })
  } catch (error) {
    console.error('Erro ao consultar status do pagamento:', error)
    return res.status(503).json({ error: 'Status do pagamento indisponível.' })
  }
}