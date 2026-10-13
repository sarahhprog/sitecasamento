
import { MercadoPagoConfig, Preference } from 'mercadopago'
import {
  installmentsForAmount,
  parseGiftPaymentInput,
} from '../_lib/giftPaymentUtils.js'
import { safeErrorDetails } from '../_lib/safeErrorDetails.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { getSiteUrl } from '../_lib/siteUrl.js'

const SCHEMA_ERROR_CODES = new Set(['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'])

function sendExistingCheckout(res, payment) {
  if (payment.payment_status === 'approved') {
    return res.status(409).json({ error: 'Este pagamento já foi confirmado.' })
  }
  if (!payment.checkout_url || !payment.preference_id) {
    return res.status(409).json({
      error: 'Este pagamento já está sendo preparado. Aguarde alguns segundos e tente novamente.',
    })
  }

  return res.status(200).json({
    init_point: payment.checkout_url,
    purchase_id: payment.idempotency_key,
  })
}

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

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  const siteUrl = getSiteUrl()
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({
      error: 'O registro seguro de pagamentos não está configurado no servidor.',
      code: 'SUPABASE_SERVER_CONFIGURATION',
    })
  }
  if (!accessToken || !siteUrl) {
    return res.status(503).json({
      error: 'O checkout não está configurado no servidor.',
      code: 'MERCADOPAGO_SERVER_CONFIGURATION',
    })
  }

  let failureStage = 'supabase_gift_reservation'
  let failureOperation = 'reserve_gift_and_create_payment'
  try {
    const supabase = (dependencies.getSupabaseAdmin || getSupabaseAdmin)()
    const reservationExpiresAt = new Date(Date.now() + 30 * 60 * 1000)
    const { data: reservations, error: reservationError } = await supabase.rpc(
      'reserve_gift_payment',
      {
        p_gift_id: input.giftId,
        p_idempotency_key: input.idempotencyKey,
        p_guest_name: input.guestName,
        p_message: input.message,
        p_reservation_expires_at: reservationExpiresAt.toISOString(),
      },
    )

    if (reservationError) throw reservationError
    const payment = Array.isArray(reservations) ? reservations[0] : reservations
    if (!payment) {
      return res.status(409).json({
        error: 'Este presente não está mais disponível. Atualize a lista e escolha outro.',
        code: 'GIFT_UNAVAILABLE',
      })
    }
    if (payment.payment_status === 'approved') {
      return res.status(409).json({
        error: 'Este pagamento já foi confirmado.',
        code: 'GIFT_ALREADY_PAID',
      })
    }
    if (payment.checkout_url && payment.preference_id) return sendExistingCheckout(res, payment)

    const amount = Math.round(Number(payment.amount) * 100) / 100
    const installments = installmentsForAmount(amount)
    const giftName = payment.gift_name
    const expiresAt = payment.reservation_expires_at || reservationExpiresAt.toISOString()
    failureStage = 'mercadopago_preference'
    failureOperation = 'create_mercadopago_preference'
    const preference = new Preference(new MercadoPagoConfig({ accessToken }))
    const preferenceBody = {
      items: [{
        id: payment.gift_id,
        title: giftName,
        quantity: 1,
        unit_price: amount,
        currency_id: 'BRL',
      }],
      payer: { name: input.guestName },
      external_reference: input.idempotencyKey,
      metadata: {
        gift_payment_id: payment.idempotency_key,
        gift_id: payment.gift_id,
      },
      expiration_date_from: new Date(Date.now() - 60 * 1000).toISOString(),
      expiration_date_to: expiresAt,
      notification_url: `${siteUrl}/api/mercado-pago/webhook`,
      back_urls: {
        success: `${siteUrl}/pagamento/resultado?purchase=${input.idempotencyKey}`,
        pending: `${siteUrl}/pagamento/resultado?purchase=${input.idempotencyKey}`,
        failure: `${siteUrl}/pagamento/resultado?purchase=${input.idempotencyKey}`,
      },
      auto_return: 'approved',
      payment_methods: { installments },
    }
    const result = dependencies.createPreference
      ? await dependencies.createPreference({
          accessToken,
          body: preferenceBody,
          idempotencyKey: input.idempotencyKey,
        })
      : await preference.create({
          body: preferenceBody,
          requestOptions: { idempotencyKey: input.idempotencyKey },
        })

    if (!result.id || !result.init_point) {
      throw new Error('O Mercado Pago não retornou um checkout válido.')
    }

    failureStage = 'supabase_payment_ledger_update'
    failureOperation = 'save_preference_reference'
    const { data: updatedPayment, error: updateError } = await supabase
      .from('gift_payments')
      .update({
        preference_id: String(result.id),
        checkout_url: result.init_point,
        updated_at: new Date().toISOString(),
      })
      .eq('idempotency_key', input.idempotencyKey)
      .select('idempotency_key,preference_id,checkout_url')
      .single()

    if (updateError) throw updateError

    return res.status(200).json({
      init_point: updatedPayment.checkout_url,
      purchase_id: updatedPayment.idempotency_key,
    })
  } catch (error) {
    const isSupabaseFailure = failureStage.startsWith('supabase_')
    const errorDetails = safeErrorDetails(error)
    const isSchemaFailure = SCHEMA_ERROR_CODES.has(errorDetails.code)
    const isReservationFailure = failureStage === 'supabase_gift_reservation'
    const isServerConfigurationFailure = errorDetails.code === 'SUPABASE_SERVER_ROLE_REQUIRED'
    console.error('Falha ao iniciar pagamento de presente:', {
      stage: failureStage,
      operation: failureOperation,
      ...errorDetails,
    })
    const code = isServerConfigurationFailure
      ? 'SUPABASE_SERVER_CONFIGURATION'
      : isSupabaseFailure
        ? isSchemaFailure
          ? 'SUPABASE_SCHEMA_FAILURE'
          : isReservationFailure
            ? 'SUPABASE_GIFT_RESERVATION_FAILURE'
            : 'SUPABASE_PAYMENT_LEDGER_FAILURE'
        : 'MERCADOPAGO_PREFERENCE_FAILED'
    const message = isServerConfigurationFailure
      ? 'A conexão privada do Supabase não está configurada corretamente.'
      : isSupabaseFailure
        ? isReservationFailure
          ? 'Não foi possível reservar este presente.'
          : 'Não foi possível registrar o pagamento com segurança.'
        : 'Não foi possível criar o checkout no Mercado Pago.'

    return res.status(isSupabaseFailure ? 503 : 502).json({ error: message, code })
  }
}