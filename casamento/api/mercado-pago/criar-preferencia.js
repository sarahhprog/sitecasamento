
import { MercadoPagoConfig, Preference } from 'mercadopago'
import {
  installmentsForAmount,
  parseGiftPaymentInput,
} from '../_lib/giftPaymentUtils.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

function getSiteUrl() {
  const configuredUrl = process.env.SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  if (!configuredUrl) return null

  try {
    const url = new URL(configuredUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.origin
  } catch {
    return null
  }
}

function sendExistingCheckout(res, payment) {
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

export default async function handler(req, res) {
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
  if (!accessToken || !siteUrl) {
    return res.status(503).json({
      error: 'O pagamento ainda não está configurado no servidor.',
    })
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data: gift, error: giftError } = await supabase
      .from('gifts')
      .select('id,name,value,available,public_visible')
      .eq('id', input.giftId)
      .eq('public_visible', true)
      .eq('available', true)
      .maybeSingle()

    if (giftError) throw giftError
    if (!gift) return res.status(404).json({ error: 'Este presente não está disponível.' })

    const amount = Math.round(Number(gift.value) * 100) / 100
    const installments = installmentsForAmount(amount)
    let { data: payment, error: lookupError } = await supabase
      .from('gift_payments')
      .select('*')
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (payment) {
      const sameCheckout = payment.gift_id === gift.id
        && payment.gift_name === gift.name
        && Number(payment.amount) === amount
        && payment.guest_name === input.guestName
        && payment.message === input.message
      if (!sameCheckout) {
        return res.status(409).json({ error: 'O identificador deste pagamento já foi utilizado.' })
      }
      if (payment.checkout_url && payment.preference_id) return sendExistingCheckout(res, payment)
    } else {
      const { data: insertedPayment, error: insertError } = await supabase
        .from('gift_payments')
        .insert({
          idempotency_key: input.idempotencyKey,
          guest_name: input.guestName,
          message: input.message,
          gift_id: gift.id,
          gift_name: gift.name,
          amount,
          currency_id: 'BRL',
          payment_status: 'pending',
        })
        .select('*')
        .single()

      if (insertError?.code === '23505') {
        const { data: existingPayment, error: retryLookupError } = await supabase
          .from('gift_payments')
          .select('*')
          .eq('idempotency_key', input.idempotencyKey)
          .maybeSingle()
        if (retryLookupError) throw retryLookupError
        if (!existingPayment) throw insertError
        const sameCheckout = existingPayment.gift_id === gift.id
          && existingPayment.gift_name === gift.name
          && Number(existingPayment.amount) === amount
          && existingPayment.guest_name === input.guestName
          && existingPayment.message === input.message
        if (!sameCheckout) {
          return res.status(409).json({ error: 'O identificador deste pagamento já foi utilizado.' })
        }
        if (existingPayment.checkout_url && existingPayment.preference_id) {
          return sendExistingCheckout(res, existingPayment)
        }
        payment = existingPayment
      } else if (insertError) {
        throw insertError
      } else {
        payment = insertedPayment
      }
    }

    const preference = new Preference(new MercadoPagoConfig({ accessToken }))
    const result = await preference.create({
      body: {
        items: [{
          id: gift.id,
          title: gift.name,
          quantity: 1,
          unit_price: amount,
          currency_id: 'BRL',
        }],
        payer: { name: input.guestName },
        external_reference: input.idempotencyKey,
        metadata: {
          gift_payment_id: payment.idempotency_key,
          gift_id: gift.id,
        },
        notification_url: `${siteUrl}/api/mercado-pago/webhook`,
        back_urls: {
          success: `${siteUrl}/pagamento/resultado?purchase=${input.idempotencyKey}`,
          pending: `${siteUrl}/pagamento/resultado?purchase=${input.idempotencyKey}`,
          failure: `${siteUrl}/pagamento/resultado?purchase=${input.idempotencyKey}`,
        },
        auto_return: 'approved',
        payment_methods: { installments },
      },
      requestOptions: { idempotencyKey: input.idempotencyKey },
    })

    if (!result.id || !result.init_point) {
      throw new Error('O Mercado Pago não retornou um checkout válido.')
    }

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
    console.error('Erro ao criar preferência de presente:', error)
    return res.status(500).json({ error: 'Não foi possível iniciar o pagamento.' })
  }
}