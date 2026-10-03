import { MercadoPagoConfig, Payment } from 'mercadopago'
import {
  normalizePaymentStatus,
  paymentMatchesPurchase,
  verifyWebhookSignature,
} from '../_lib/giftPaymentUtils.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function handler(req, res) {
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

  try {
    const paymentClient = new Payment(new MercadoPagoConfig({ accessToken }))
    const payment = await paymentClient.get({ id: String(paymentId) })
    const idempotencyKey = String(payment.external_reference || '')

    if (!UUID_PATTERN.test(idempotencyKey)) {
      return res.status(200).json({ received: true })
    }

    const supabase = getSupabaseAdmin()
    const { data: purchase, error: lookupError } = await supabase
      .from('gift_payments')
      .select('id,idempotency_key,amount,currency_id,preference_id,mp_payment_updated_at,paid_at')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (!purchase) return res.status(200).json({ received: true })

    if (!paymentMatchesPurchase(payment, purchase)) {
      console.error('Notificação Mercado Pago não corresponde ao pagamento registrado.')
      return res.status(200).json({ received: true })
    }

    const paymentUpdatedAt = payment.date_last_updated
      ? new Date(payment.date_last_updated)
      : new Date()
    if (Number.isNaN(paymentUpdatedAt.getTime())) {
      throw new Error('O Mercado Pago retornou uma data de atualização inválida.')
    }
    if (purchase.mp_payment_updated_at
      && paymentUpdatedAt.getTime() < new Date(purchase.mp_payment_updated_at).getTime()) {
      return res.status(200).json({ received: true })
    }

    const paymentStatus = normalizePaymentStatus(payment.status)
    const update = {
      mp_payment_id: String(payment.id),
      mp_payment_updated_at: paymentUpdatedAt.toISOString(),
      amount: Math.round(Number(payment.transaction_amount) * 100) / 100,
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    }
    if (paymentStatus === 'approved') {
      update.paid_at = payment.date_approved || purchase.paid_at || new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('gift_payments')
      .update(update)
      .eq('id', purchase.id)

    if (updateError) throw updateError
    return res.status(200).json({ received: true })
  } catch (error) {
    console.error('Erro ao processar notificação de pagamento:', error)
    return res.status(500).json({ error: 'Não foi possível confirmar a notificação.' })
  }
}