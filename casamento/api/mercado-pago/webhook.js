import { MercadoPagoConfig, Payment } from 'mercadopago'
import {
  normalizePaymentStatus,
  paymentMatchesPurchase,
  verifyWebhookSignature,
} from '../_lib/giftPaymentUtils.js'
import { safeErrorDetails } from '../_lib/safeErrorDetails.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function handler(req, res, dependencies = {}) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' })
  }

  const eventType = req.body?.type || req.query?.type || req.query?.topic
  if (eventType && !String(eventType).startsWith('payment')) {
    return res.status(200).json({ received: true })
  }

  const paymentId = req.body?.data?.id || req.query?.['data.id'] || req.query?.id
  const signature = req.headers['x-signature']
  const requestId = req.headers['x-request-id']
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET

  if (!paymentId || !signature || !requestId || !webhookSecret) {
    return res.status(webhookSecret ? 400 : 503).json({ error: 'Notificação inválida ou não configurada.' })
  }

  if (!verifyWebhookSignature({
    signature,
    requestId,
    dataId: paymentId,
    secret: webhookSecret,
  })) {
    return res.status(401).json({ error: 'Assinatura inválida.' })
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!accessToken) return res.status(503).json({ error: 'Verificação de pagamento indisponível.' })

  let failureStage = 'mercadopago_payment_lookup'
  let failureOperation = 'retrieve_payment_from_mercadopago'
  try {
    const payment = dependencies.getPayment
      ? await dependencies.getPayment(String(paymentId))
      : await new Payment(new MercadoPagoConfig({ accessToken })).get({ id: String(paymentId) })
    const idempotencyKey = String(payment.external_reference || '')

    if (!UUID_PATTERN.test(idempotencyKey)) {
      return res.status(200).json({ received: true })
    }

    failureStage = 'supabase_purchase_lookup'
    failureOperation = 'read_payment_snapshot'
    const supabase = (dependencies.getSupabaseAdmin || getSupabaseAdmin)()
    const { data: purchase, error: lookupError } = await supabase
      .from('gift_payments')
      .select('id,gift_id,idempotency_key,amount,currency_id,preference_id,mp_payment_updated_at,paid_at')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (!purchase) return res.status(200).json({ received: true })

    if (!paymentMatchesPurchase(payment, purchase)) {
      console.error('Notificação de pagamento rejeitada:', {
        stage: 'payment_snapshot_validation',
        operation: 'compare_provider_payment_with_record',
        code: 'PAYMENT_SNAPSHOT_MISMATCH',
      })
      return res.status(200).json({ received: true })
    }

    const paymentUpdatedAt = new Date(payment.date_last_updated || '')
    if (Number.isNaN(paymentUpdatedAt.getTime())) {
      throw new Error('O Mercado Pago retornou uma data de atualização inválida.')
    }
    const paymentStatus = normalizePaymentStatus(payment.status)
    failureStage = 'supabase_payment_and_gift_update'
    failureOperation = 'apply_payment_status_and_gift_availability'
    const { error: updateError } = await supabase.rpc('apply_gift_payment_status', {
      p_idempotency_key: idempotencyKey,
      p_payment_id: String(payment.id),
      p_payment_updated_at: paymentUpdatedAt.toISOString(),
      p_payment_status: paymentStatus,
      p_amount: Math.round(Number(payment.transaction_amount) * 100) / 100,
      p_paid_at: payment.date_approved || null,
    })

    if (updateError) throw updateError
    return res.status(200).json({ received: true })
  } catch (error) {
    console.error('Erro ao processar notificação de pagamento:', {
      stage: failureStage,
      operation: failureOperation,
      ...safeErrorDetails(error),
    })
    return res.status(500).json({ error: 'Não foi possível confirmar a notificação.' })
  }
}