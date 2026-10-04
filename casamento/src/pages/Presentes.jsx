import { useEffect, useMemo, useRef, useState } from 'react'
import PageLayout from './PageLayout'
import { gifts } from '../data/gifts'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'

const PAGE_SIZE = 12

function formatValue(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function GiftCard({ gift, onSelect, paymentsEnabled }) {
  const unavailable = gift.available === false || gift.status === 'unavailable'

  return (
    <article className={`gift-card ${unavailable ? 'gift-card-unavailable' : ''}`}>
      <div className="gift-image-wrap" aria-hidden="true">
        {gift.image_url && (
          <img className="gift-image" src={gift.image_url} alt="" />
        )}
      </div>

      <div className="gift-card-content">
        <h2>{gift.name}</h2>
        <p>{gift.description}</p>

        <div className="gift-card-footer">
          <strong>{formatValue(gift.value)}</strong>

          <button
            className="button gift-button"
            type="button"
            disabled={unavailable || !paymentsEnabled}
            aria-label={`Presentear com ${gift.name}`}
            onClick={() => onSelect(gift)}
          >
            {unavailable ? 'Indisponível' : 'Presentear'}
          </button>
        </div>

        {gift.file_url && gift.file_type === 'application/pdf' && (
          <a
            className="gift-file-link"
            href={gift.file_url}
            target="_blank"
            rel="noreferrer"
          >
            Visualizar arquivo PDF
          </a>
        )}
      </div>
    </article>
  )
}

function Presentes() {
  const whatsappMessage = encodeURIComponent(
    'Olá! Sou convidado(a) do casamento e gostaria de conversar sobre um presente.'
  )

  const [remoteGifts, setRemoteGifts] = useState([])
  const [giftCount, setGiftCount] = useState(0)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [selectedGift, setSelectedGift] = useState(null)
  const [guestName, setGuestName] = useState('')
  const [message, setMessage] = useState('')
  const [checkoutAttemptId, setCheckoutAttemptId] = useState('')
  const [checkoutError, setCheckoutError] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const guestNameInput = useRef(null)

  const pageCount = Math.ceil(
    (isSupabaseConfigured ? giftCount : gifts.length) / PAGE_SIZE
  )

  const currentPage = Math.min(page, Math.max(pageCount, 1))

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined

    let active = true

    async function loadGifts() {
      const { data, count, error: queryError } = await requireSupabase()
        .from('gifts')
        .select(
          'id,name,description,value,category,image_url,file_url,file_type,available,public_visible,created_at',
          { count: 'exact' }
        )
        .eq('public_visible', true)
        .order('created_at', { ascending: true })
        .range(
          (currentPage - 1) * PAGE_SIZE,
          currentPage * PAGE_SIZE - 1
        )

      if (!active) return

      if (queryError) {
        setError(queryError.message)
      } else {
        setRemoteGifts(data || [])
        setGiftCount(count || 0)
      }

      setLoading(false)
    }

    loadGifts().catch((loadError) => {
      if (!active) return

      setError(loadError.message)
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [currentPage])

  const publicGifts = isSupabaseConfigured
    ? remoteGifts
    : gifts.map((gift) => ({
        ...gift,
        available: gift.status === 'available',
        image_url: gift.image,
      }))

  const visibleGifts = useMemo(
    () =>
      isSupabaseConfigured
        ? publicGifts
        : publicGifts.slice(
            (currentPage - 1) * PAGE_SIZE,
            currentPage * PAGE_SIZE
          ),
    [publicGifts, currentPage]
  )

  function changePage(nextPage) {
    setLoading(isSupabaseConfigured)
    setPage(nextPage)
  }

  function openCheckout(gift) {
    setSelectedGift(gift)
    setGuestName('')
    setMessage('')
    setCheckoutError('')
    setCheckoutAttemptId(crypto.randomUUID())
  }

  function closeCheckout() {
    if (checkoutBusy) return
    setSelectedGift(null)
    setCheckoutError('')
  }

  useEffect(() => {
    if (!selectedGift) return undefined
    guestNameInput.current?.focus()

    function handleEscape(event) {
      if (event.key === 'Escape' && !checkoutBusy) {
        setSelectedGift(null)
        setCheckoutError('')
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [selectedGift, checkoutBusy])

  async function handleCheckoutSubmit(event) {
    event.preventDefault()
    if (!selectedGift || checkoutBusy) return

    const trimmedName = guestName.trim()
    const trimmedMessage = message.trim()
    if (!trimmedName) {
      setCheckoutError('Informe seu nome para continuar.')
      guestNameInput.current?.focus()
      return
    }
    if (trimmedName.length > 120) {
      setCheckoutError('O nome deve ter no máximo 120 caracteres.')
      return
    }
    if (trimmedMessage.length > 300) {
      setCheckoutError('A mensagem deve ter no máximo 300 caracteres.')
      return
    }

    setCheckoutBusy(true)
    setCheckoutError('')
    try {
      const response = await fetch('/api/mercado-pago/criar-preferencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          giftId: selectedGift.id,
          idempotencyKey: checkoutAttemptId,
          guestName: trimmedName,
          message: trimmedMessage,
        }),
      })
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        if (response.status === 404) {
          throw new Error('A API de pagamentos não está disponível neste servidor. Em desenvolvimento, execute as funções Vercel com `npx vercel dev`.')
        }
        throw new Error('O servidor de pagamentos retornou uma resposta inválida.')
      }
      const data = await response.json()

      if (!response.ok || !data.init_point) {
        const configMessages = {
          SUPABASE_SERVER_CONFIGURATION: 'Configure a conexão privada do Supabase no ambiente server-side da Vercel.',
          SUPABASE_SCHEMA_OR_PERMISSION: 'A tabela de pagamentos não está disponível. Aplique a migration do fluxo de presentes no Supabase.',
          MERCADOPAGO_SERVER_CONFIGURATION: 'Configure o token do Mercado Pago e a URL pública no ambiente server-side da Vercel.',
          MERCADOPAGO_PREFERENCE_FAILED: 'O Mercado Pago não conseguiu criar o checkout. Verifique os logs da função na Vercel.',
        }
        throw new Error(configMessages[data.code] || data.error || 'Não foi possível iniciar o pagamento.')
      }
      window.location.assign(data.init_point)
    } catch (checkoutFailure) {
      setCheckoutError(checkoutFailure.message || 'Não foi possível conectar ao servidor.')
    } finally {
      setCheckoutBusy(false)
    }
  }

  return (
    <PageLayout eyebrow="Com carinho" title="Lista de presentes">
      <p className="page-intro">
        Escolhemos alguns presentes para representar, de forma simbólica, tudo
        o que fará parte do nosso novo capítulo juntos. Fique à vontade para
        escolher aquilo que quiser nos presentear.
      </p>

      <section className="gifts-section" aria-label="Opções de presentes">
        {error && (
          <p className="admin-alert" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p>Carregando presentes…</p>
        ) : (
          <>
            <div className="gifts-grid">
              {visibleGifts.map((gift) => (
                <GiftCard
                  key={gift.id}
                  gift={gift}
                  onSelect={openCheckout}
                  paymentsEnabled={isSupabaseConfigured}
                />
              ))}
            </div>

            {publicGifts.length === 0 && (
              <p>Nenhum presente disponível no momento.</p>
            )}

            {pageCount > 1 && (
              <nav
                className="gift-pagination"
                aria-label="Paginação da lista de presentes"
              >
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => changePage(currentPage - 1)}
                >
                  Página anterior
                </button>

                <div>
                  {Array.from(
                    { length: pageCount },
                    (_, index) => index + 1
                  ).map((number) => (
                    <button
                      className={currentPage === number ? 'active' : ''}
                      type="button"
                      aria-current={
                        currentPage === number ? 'page' : undefined
                      }
                      key={number}
                      onClick={() => changePage(number)}
                    >
                      {number}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={currentPage === pageCount}
                  onClick={() => changePage(currentPage + 1)}
                >
                  Próxima página
                </button>
              </nav>
            )}
          </>
        )}
      </section>

      <aside className="gift-contact">
        <span className="eyebrow">Uma escolha só sua</span>

        <h2>Quero dar algo diferente</h2>

        <p>
          Pensou em outro presente ou precisa de alguma informação? Fale com a
          gente pelo WhatsApp.
        </p>

        <a
          className="button"
          href={`https://wa.me/5531997150212?text=${whatsappMessage}`}
          target="_blank"
          rel="noreferrer"
        >
          Falar pelo WhatsApp
        </a>
      </aside>

      {selectedGift && (
        <div
          className="gift-checkout-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCheckout()
          }}
        >
          <section
            className="gift-checkout-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gift-checkout-title"
          >
            <span className="eyebrow">Um presente especial</span>
            <h2 id="gift-checkout-title">{selectedGift.name}</h2>
            <p className="gift-checkout-value">{formatValue(selectedGift.value)}</p>

            <form onSubmit={handleCheckoutSubmit}>
              <label className="gift-checkout-field">
                Seu nome
                <input
                  ref={guestNameInput}
                  type="text"
                  name="guestName"
                  autoComplete="name"
                  maxLength={120}
                  required
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                />
              </label>

              <label className="gift-checkout-field">
                Mensagem para os noivos (opcional)
                <textarea
                  name="message"
                  maxLength={300}
                  rows={4}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  aria-describedby="gift-message-count"
                />
                <span className="gift-message-count" id="gift-message-count">
                  {message.length}/300
                </span>
              </label>

              {checkoutError && <p className="admin-alert" role="alert">{checkoutError}</p>}

              <div className="gift-checkout-actions">
                <button
                  className="button button-muted"
                  type="button"
                  onClick={closeCheckout}
                  disabled={checkoutBusy}
                >
                  Voltar
                </button>
                <button className="button" type="submit" disabled={checkoutBusy}>
                  {checkoutBusy ? 'Preparando pagamento…' : 'Seguir para pagamento'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </PageLayout>
  )
}

export default Presentes
