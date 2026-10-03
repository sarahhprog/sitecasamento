import { useEffect, useMemo, useState } from 'react'
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

function GiftCard({ gift }) {
  const unavailable = gift.available === false || gift.status === 'unavailable'

  async function handlePresentear() {
    try {
      const response = await fetch('/api/mercado-pago/criar-preferencia', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: gift.name,
          quantity: 1,
          unit_price: Number(gift.value),
        }),
      })

      const data = await response.json()

      if (data.init_point) {
        window.location.href = data.init_point
        return
      }

      alert(data.error || 'Não foi possível criar o pagamento.')
    } catch (error) {
      console.error(error)
      alert('Não foi possível conectar ao Mercado Pago.')
    }
  }

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
            disabled={unavailable}
            aria-label={`Presentear com ${gift.name}`}
            onClick={handlePresentear}
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
                <GiftCard key={gift.id} gift={gift} />
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
    </PageLayout>
  )
}

export default Presentes
