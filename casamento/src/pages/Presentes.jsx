import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PageLayout from './PageLayout'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import { copyPixKeyToClipboard } from '../lib/pix'

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
            onClick={(event) => onSelect(gift, event.currentTarget)}
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
  const [error, setError] = useState(
    isSupabaseConfigured ? '' : 'A lista de presentes não está configurada neste ambiente.'
  )
  const [page, setPage] = useState(1)
  const [selectedGift, setSelectedGift] = useState(null)
  const [guestName, setGuestName] = useState('')
  const [message, setMessage] = useState('')
  const [checkoutAttemptId, setCheckoutAttemptId] = useState('')
  const [checkoutError, setCheckoutError] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState('details')
  const [pixSettings, setPixSettings] = useState(null)
  const [pixPayment, setPixPayment] = useState(null)
  const [pixCopied, setPixCopied] = useState(false)
  const checkoutBusyRef = useRef(false)
  const guestNameInput = useRef(null)
  const checkoutDialog = useRef(null)
  const previousFocus = useRef(null)
  const refreshGifts = useRef(null)

  const pageCount = Math.ceil(giftCount / PAGE_SIZE)

  const currentPage = Math.min(page, Math.max(pageCount, 1))

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined

    let active = true

    async function loadGifts() {
      const { data, count, error: queryError } = await requireSupabase()
        .from('gifts')
        .select(
          'id,name,description,value,category,image_url,file_url,file_type,available,public_visible,created_at,reservation_expires_at,reservation_in_process,gifted_at',
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
        console.error('Erro ao carregar presentes:', {
          code: queryError.code || 'UNKNOWN',
          status: queryError.status || null,
        })
        setError('Não foi possível carregar os presentes cadastrados. Tente novamente mais tarde.')
        setRemoteGifts([])
        setGiftCount(0)
      } else {
        const now = Date.now()
        setRemoteGifts((data || []).map((gift) => {
          const reservationActive = gift.reservation_expires_at
            && new Date(gift.reservation_expires_at).getTime() > now
          return {
            ...gift,
            available: gift.available
              && !gift.gifted_at
              && !reservationActive,
          }
        }))
        setGiftCount(count || 0)
        setError('')
      }

      setLoading(false)
    }

    loadGifts().catch((loadError) => {
      if (!active) return

      console.error('Falha ao carregar a lista de presentes:', {
        name: loadError?.name || 'Error',
        code: loadError?.code || loadError?.cause?.code || 'UNKNOWN',
      })
      setRemoteGifts([])
      setGiftCount(0)
      setError('Não foi possível carregar os presentes cadastrados. Tente novamente mais tarde.')
      setLoading(false)
    })

    refreshGifts.current = () => loadGifts().catch((loadError) => {
      if (!active) return
      console.error('Falha ao atualizar a lista de presentes:', {
        name: loadError?.name || 'Error',
        code: loadError?.code || loadError?.cause?.code || 'UNKNOWN',
      })
      setError('Não foi possível atualizar a lista de presentes.')
    })
    const refreshTimer = window.setInterval(refreshGifts.current, 15000)
    const refreshOnFocus = () => refreshGifts.current?.()
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)

    return () => {
      active = false
      window.clearInterval(refreshTimer)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
      refreshGifts.current = null
    }
  }, [currentPage])

  const publicGifts = remoteGifts

  const visibleGifts = publicGifts

  function changePage(nextPage) {
    setLoading(isSupabaseConfigured)
    setPage(nextPage)
  }

  function openCheckout(gift, trigger) {
    previousFocus.current = trigger
    checkoutBusyRef.current = false
    setSelectedGift(gift)
    setGuestName('')
    setMessage('')
    setCheckoutError('')
    setCheckoutStep('details')
    setPixSettings(null)
    setPixPayment(null)
    setPixCopied(false)
    setCheckoutAttemptId(crypto.randomUUID())
  }

  function closeCheckout() {
    if (checkoutBusyRef.current) return
    setSelectedGift(null)
    setCheckoutError('')
    setCheckoutStep('details')
  }

  useEffect(() => {
    if (!selectedGift) return undefined
    const body = document.body
    const scrollY = window.scrollY
    const previousBodyStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'

    const updateViewport = () => {
      const backdrop = checkoutDialog.current?.parentElement
      if (!backdrop) return
      const viewport = window.visualViewport
      backdrop.style.setProperty(
        '--checkout-viewport-height',
        `${viewport?.height || window.innerHeight}px`
      )
      backdrop.style.setProperty(
        '--checkout-viewport-offset',
        `${viewport?.offsetTop || 0}px`
      )
    }
    updateViewport()
    window.visualViewport?.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('scroll', updateViewport)
    const focusFrame = window.requestAnimationFrame(() => {
      if (window.matchMedia('(pointer: coarse)').matches) {
        checkoutDialog.current?.focus({ preventScroll: true })
      } else {
        guestNameInput.current?.focus({ preventScroll: true })
      }
    })

    function handleDialogKeydown(event) {
      if (event.key === 'Escape' && !checkoutBusyRef.current) {
        setSelectedGift(null)
        setCheckoutError('')
        return
      }
      if (event.key !== 'Tab') return

      const focusable = checkoutDialog.current?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]'
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleDialogKeydown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.visualViewport?.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('keydown', handleDialogKeydown)
      body.style.position = previousBodyStyles.position
      body.style.top = previousBodyStyles.top
      body.style.left = previousBodyStyles.left
      body.style.right = previousBodyStyles.right
      body.style.width = previousBodyStyles.width
      window.scrollTo(0, scrollY)
      if (previousFocus.current?.isConnected) previousFocus.current.focus()
    }
  }, [selectedGift])

  function validateGuestDetails() {
    const trimmedName = guestName.trim()
    const trimmedMessage = message.trim()
    if (!trimmedName) {
      setCheckoutError('Informe seu nome para continuar.')
      guestNameInput.current?.focus()
      return null
    }
    if (trimmedName.length > 120) {
      setCheckoutError('O nome deve ter no máximo 120 caracteres.')
      return null
    }
    if (trimmedMessage.length > 300) {
      setCheckoutError('A mensagem deve ter no máximo 300 caracteres.')
      return null
    }
    return { trimmedName, trimmedMessage }
  }

  async function handleCardCheckout(event) {
    event.preventDefault()
    if (!selectedGift || checkoutBusy) return
    const guest = validateGuestDetails()
    if (!guest) return

    setCheckoutBusy(true)
    checkoutBusyRef.current = true
    setCheckoutError('')
    try {
      const response = await fetch('/api/mercado-pago/criar-preferencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          giftId: selectedGift.id,
          idempotencyKey: checkoutAttemptId,
          guestName: guest.trimmedName,
          message: guest.trimmedMessage,
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
          SUPABASE_GIFT_CATALOG_FAILURE: 'Não foi possível consultar os dados deste presente. Tente novamente mais tarde.',
          SUPABASE_PAYMENT_LEDGER_FAILURE: 'Não foi possível registrar o pagamento com segurança. Tente novamente mais tarde.',
          SUPABASE_SCHEMA_FAILURE: 'A estrutura do banco não corresponde à versão esperada pelo fluxo de pagamentos. Verifique os logs da função na Vercel.',
          SUPABASE_SCHEMA_OR_PERMISSION: 'Não foi possível acessar o catálogo ou registrar o pagamento. Verifique os logs da função na Vercel.',
          SUPABASE_GIFT_RESERVATION_FAILURE: 'Não foi possível reservar este presente. Tente novamente mais tarde.',
          MERCADOPAGO_SERVER_CONFIGURATION: 'Configure o token do Mercado Pago e a URL pública no ambiente server-side da Vercel.',
          MERCADOPAGO_PREFERENCE_FAILED: 'O Mercado Pago não conseguiu criar o checkout. Verifique os logs da função na Vercel.',
          GIFT_UNAVAILABLE: 'Outra pessoa acabou de reservar este presente. A lista foi atualizada; escolha outro.',
          GIFT_ALREADY_PAID: 'Este presente já foi presenteado.',
        }
        if (data.code === 'GIFT_UNAVAILABLE' || data.code === 'GIFT_ALREADY_PAID') {
          refreshGifts.current?.()
        }
        throw new Error(configMessages[data.code] || data.error || 'Não foi possível iniciar o pagamento.')
      }
      window.location.assign(data.init_point)
    } catch (checkoutFailure) {
      setCheckoutError(checkoutFailure.message || 'Não foi possível conectar ao servidor.')
    } finally {
      checkoutBusyRef.current = false
      setCheckoutBusy(false)
    }
  }

  async function handlePixStart() {
    if (!selectedGift || checkoutBusy) return
    const guest = validateGuestDetails()
    if (!guest) return

    setCheckoutBusy(true)
    checkoutBusyRef.current = true
    setCheckoutError('')
    try {
      const reserveResponse = await fetch('/api/presentes/pix/reservar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          giftId: selectedGift.id,
          idempotencyKey: checkoutAttemptId,
          guestName: guest.trimmedName,
          message: guest.trimmedMessage,
        }),
      })
      const reservation = await reserveResponse.json()
      if (!reserveResponse.ok || !reservation.purchase_id) {
        if (reservation.code === 'GIFT_UNAVAILABLE') refreshGifts.current?.()
        throw new Error(reservation.error || 'Não foi possível reservar este presente para o PIX.')
      }

      setPixSettings({
        pixKey: reservation.pix_key,
        recipientName: reservation.recipient_name,
      })
      setPixPayment(reservation)
      setCheckoutStep('pix')
    } catch (pixError) {
      setCheckoutError(pixError.message || 'Não foi possível iniciar o pagamento via PIX.')
    } finally {
      checkoutBusyRef.current = false
      setCheckoutBusy(false)
    }
  }

  async function handleCopyPixKey() {
    if (!pixSettings?.pixKey) return
    try {
      await copyPixKeyToClipboard(pixSettings.pixKey)
      setPixCopied(true)
      setCheckoutError('')
    } catch {
      setCheckoutError('Não foi possível copiar automaticamente. Selecione e copie a chave PIX.')
    }
  }

  async function handlePixConfirmationRequest() {
    if (!pixPayment?.purchase_id || checkoutBusy) return
    setCheckoutBusy(true)
    checkoutBusyRef.current = true
    setCheckoutError('')
    try {
      const response = await fetch('/api/presentes/pix/solicitar-confirmacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: pixPayment.purchase_id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || result.error || 'Não foi possível registrar seu aviso.')
      setCheckoutStep('pix-confirmed')
      refreshGifts.current?.()
    } catch (requestError) {
      setCheckoutError(requestError.message || 'Não foi possível registrar seu aviso.')
    } finally {
      checkoutBusyRef.current = false
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

            {publicGifts.length === 0 && !error && (
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

      {selectedGift && createPortal(
        <div
          className="gift-checkout-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCheckout()
          }}
        >
          <section
            className="gift-checkout-dialog"
            ref={checkoutDialog}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gift-checkout-title"
          >
            <span className="eyebrow">Um presente especial</span>
            <h2 id="gift-checkout-title">{selectedGift.name}</h2>
            <p className="gift-checkout-value">{formatValue(selectedGift.value)}</p>

            {checkoutStep === 'details' && <form onSubmit={handleCardCheckout}>
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
                  {checkoutBusy ? 'Preparando pagamento…' : 'Presentear via cartão'}
                </button>
                <button className="button button-pix" type="button" onClick={handlePixStart} disabled={checkoutBusy}>
                  {checkoutBusy ? 'Preparando PIX…' : 'Presentear via PIX'}
                </button>
              </div>
            </form>}

            {checkoutStep === 'pix' && pixSettings && pixPayment && <section className="gift-pix-details">
              <span className="eyebrow">Pagamento manual via PIX</span>
              <p>Transfira pelo aplicativo do seu banco para:</p>
              <p><strong>Destinatário:</strong> {pixSettings.recipientName}</p>
              <label className="gift-checkout-field">
                Chave PIX
                <input type="text" readOnly value={pixSettings.pixKey} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <button className="button button-muted" type="button" onClick={handleCopyPixKey}>
                {pixCopied ? 'Chave copiada' : 'Copiar chave PIX'}
              </button>
              <p className="gift-pix-summary">
                <strong>{pixPayment.gift_name}</strong> · {formatValue(pixPayment.amount)}
              </p>
              <p>Após realizar a transferência no aplicativo do banco, avise-nos por aqui. O presente só será confirmado depois que o pagamento for verificado pelos noivos.</p>
              {checkoutError && <p className="admin-alert" role="alert">{checkoutError}</p>}
              <div className="gift-checkout-actions">
                <button className="button button-muted" type="button" onClick={closeCheckout} disabled={checkoutBusy}>Fechar</button>
                <button className="button" type="button" onClick={handlePixConfirmationRequest} disabled={checkoutBusy}>
                  {checkoutBusy ? 'Registrando…' : 'Já fiz o pagamento'}
                </button>
              </div>
            </section>}

            {checkoutStep === 'pix-confirmed' && <section className="gift-pix-details">
              <span className="eyebrow">Aguardando verificação</span>
              <h3>Recebemos seu aviso!</h3>
              <p>Vamos verificar o pagamento antes de confirmar o presente. Agradecemos por celebrar esse momento tão especial com a gente. 💚</p>
              <button className="button" type="button" onClick={closeCheckout}>Fechar</button>
            </section>}
          </section>
        </div>,
        document.body
      )}
    </PageLayout>
  )
}

export default Presentes
