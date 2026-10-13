import { parseGiftPaymentInput } from '../../_lib/giftPaymentUtils.js'
import { safeErrorDetails } from '../../_lib/safeErrorDetails.js'
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js'

export default async function handler(req, res, dependencies = {}) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' })
  }

  let input
  try {
    input = parseGiftPaymentInput(req.body)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY
    || !(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) {
    return res.status(503).json({ error: 'O pagamento PIX não está configurado no servidor.' })
  }

  let failureStage = 'supabase_pix_settings'
  try {
    const supabase = (dependencies.getSupabaseAdmin || getSupabaseAdmin)()
    const { data: settings, error: settingsError } = await supabase
      .from('wedding_settings')
      .select('key,value')
      .in('key', ['pix_key', 'pix_recipient_name'])
    if (settingsError) throw settingsError

    const settingsByKey = new Map((settings || []).map((row) => [row.key, row.value]))
    const pixKey = typeof settingsByKey.get('pix_key') === 'string'
      ? settingsByKey.get('pix_key').trim()
      : ''
    if (!pixKey) {
      return res.status(409).json({
        code: 'PIX_NOT_CONFIGURED',
        error: 'O pagamento via PIX ainda não está disponível. Entre em contato com os noivos.',
      })
    }
    const recipientName = typeof settingsByKey.get('pix_recipient_name') === 'string'
      ? settingsByKey.get('pix_recipient_name').trim() || 'Hayato Miyata Rocha'
      : 'Hayato Miyata Rocha'

    failureStage = 'supabase_pix_reservation'
    const { data: rows, error } = await supabase.rpc('reserve_gift_payment', {
      p_gift_id: input.giftId,
      p_idempotency_key: input.idempotencyKey,
      p_guest_name: input.guestName,
      p_message: input.message,
      p_reservation_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      p_payment_method: 'pix',
    })

    if (error) throw error
    const payment = Array.isArray(rows) ? rows[0] : rows
    if (!payment) {
      return res.status(409).json({
        code: 'GIFT_UNAVAILABLE',
        error: 'Este presente não está mais disponível. Atualize a lista e escolha outro.',
      })
    }

    return res.status(201).json({
      purchase_id: payment.idempotency_key,
      gift_name: payment.gift_name,
      amount: payment.amount,
      reservation_expires_at: payment.reservation_expires_at,
      pix_key: pixKey,
      recipient_name: recipientName,
    })
  } catch (error) {
    console.error('Falha ao reservar presente para PIX:', {
      stage: failureStage,
      operation: 'reserve_pix_gift',
      ...safeErrorDetails(error),
    })
    return res.status(503).json({ error: 'Não foi possível reservar este presente agora.' })
  }
}
