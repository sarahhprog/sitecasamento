import { MercadoPagoConfig, Preference } from 'mercadopago'

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  try {
    const { title, quantity, unit_price } = req.body

    const preference = new Preference(client)

    const result = await preference.create({
      body: {
        items: [
          {
            title,
            quantity: Number(quantity),
            unit_price: Number(unit_price),
            currency_id: 'BRL',
          },
        ],
      },
    })

    return res.status(200).json({
      id: result.id,
      init_point: result.init_point,
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      error: 'Não foi possível criar o pagamento.',
      details: error?.message || String(error),
    })
  }
}