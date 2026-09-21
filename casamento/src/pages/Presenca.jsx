import { useState } from 'react'
import PageLayout from './PageLayout'

function Presenca() {
  const [identification, setIdentification] = useState('')
  const [guestName, setGuestName] = useState('')
  const [response, setResponse] = useState('')

  function handleIdentification(event) {
    event.preventDefault()
    const name = identification.trim()

    if (name) {
      setGuestName(name)
    }
  }

  function handleResponse(choice) {
    setResponse(choice)
  }

  return <PageLayout eyebrow="Para o grande dia" title="Confirme sua presença">
    <p className="page-intro">Sua confirmação é muito importante para organizarmos cada detalhe desse momento e celebrarmos com quem amamos.</p>
    <div className="rsvp-flow">
      {!guestName && <form className="rsvp-step" onSubmit={handleIdentification}>
        <span className="rsvp-step-label">01 · Identificação</span>
        <h2>Encontre seu convite</h2>
        <p>Informe seu nome ou o código recebido no convite para continuar.</p>
        <label className="rsvp-label" htmlFor="guest-identification">Nome ou código do convite</label>
        <input
          className="rsvp-input"
          id="guest-identification"
          name="identification"
          type="text"
          value={identification}
          onChange={(event) => setIdentification(event.target.value)}
          autoComplete="name"
          required
        />
        <button className="button" type="submit">Continuar</button>
      </form>}

      {guestName && !response && <section className="rsvp-step" aria-live="polite">
        <span className="rsvp-step-label">02 · Sua resposta</span>
        <h2>Olá, {guestName}!</h2>
        <p>Você poderá confirmar sua presença para o nosso grande dia.</p>
        <div className="rsvp-actions">
          <button className="button" type="button" onClick={() => handleResponse('confirmed')}>Confirmar presença</button>
          <button className="button button-muted" type="button" onClick={() => handleResponse('declined')}>Não poderei comparecer</button>
        </div>
      </section>}

      {response && <section className="rsvp-step rsvp-result" aria-live="polite">
        <span className="rsvp-step-label">03 · Obrigada</span>
        <h2>{response === 'confirmed' ? 'Presença confirmada!' : 'Sentiremos sua falta!'}</h2>
        <p>{response === 'confirmed'
          ? 'Agradecemos por celebrar esse momento tão especial com a gente. 💚'
          : 'Agradecemos por nos avisar e por fazer parte da nossa história.'}</p>
      </section>}
    </div>
  </PageLayout>
}

export default Presenca
