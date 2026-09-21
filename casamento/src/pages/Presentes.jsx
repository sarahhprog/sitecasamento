import PageLayout from './PageLayout'
import { gifts } from '../data/gifts'

function formatValue(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function GiftCard({ gift }) {
  const unavailable = gift.status !== 'available'

  return <article className={`gift-card ${unavailable ? 'gift-card-unavailable' : ''}`}>
    <div className="gift-image-wrap">
      <img className="gift-image" src={gift.image} alt="" />
      {gift.category && <span className="gift-category">{gift.category}</span>}
    </div>
    <div className="gift-card-content">
      <h2>{gift.name}</h2>
      <p>{gift.description}</p>
      <div className="gift-card-footer">
        <strong>{formatValue(gift.value)}</strong>
        <button className="button gift-button" type="button" disabled={unavailable} aria-label={`Presentear com ${gift.name}`}>
          {unavailable ? 'Indisponível' : 'Presentear'}
        </button>
      </div>
    </div>
  </article>
}

function Presentes() {
  const whatsappMessage = encodeURIComponent('Olá! Sou convidado(a) do casamento e gostaria de conversar sobre um presente.')

  return <PageLayout eyebrow="Com carinho" title="Lista de presentes">
    <p className="page-intro">Escolhemos alguns presentes para representar, de forma simbólica, tudo o que fará parte do nosso novo capítulo juntos. Fique à vontade para escolher aquilo que quiser nos presentear.</p>
    <section className="gifts-section" aria-label="Opções de presentes">
      <div className="gifts-grid">
        {gifts.map((gift) => <GiftCard key={gift.id} gift={gift} />)}
      </div>
    </section>
    <aside className="gift-contact">
      <span className="eyebrow">Uma escolha só sua</span>
      <h2>Quero dar algo diferente</h2>
      <p>Pensou em outro presente ou precisa de alguma informação? Fale com a gente pelo WhatsApp.</p>
      <a className="button" href={`https://wa.me/5531997150212?text=${whatsappMessage}`} target="_blank" rel="noreferrer">Falar pelo WhatsApp</a>
    </aside>
  </PageLayout>
}

export default Presentes
