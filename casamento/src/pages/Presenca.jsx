import { useState } from 'react'
import PageLayout from './PageLayout'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'

function Presenca() {
  const [identification, setIdentification] = useState('')
  const [guestName, setGuestName] = useState('')
  const [response, setResponse] = useState('')
  const [invitation, setInvitation] = useState(null)
  const [peopleCount, setPeopleCount] = useState(1)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleIdentification(event) {
    event.preventDefault()
    const name = identification.trim()

    if (!name) return
    setError('')
    if (!isSupabaseConfigured) {
      setGuestName(name)
      return
    }

    setBusy(true)
    try {
      const { data, error: lookupError } = await requireSupabase().rpc('lookup_invitation', { invitation_text: name })
      if (lookupError) throw lookupError
      const match = data?.[0]
      if (!match) throw new Error('Não encontramos um convite com esse nome ou código.')
      setInvitation(match)
      setPeopleCount(Math.max(1, Math.min(match.confirmed_people || 1, match.party_size)))
      setGuestName(match.name)
    } catch (lookupError) {
      setError(lookupError.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleResponse(choice) {
    setError('')
    if (!invitation) {
      setResponse(choice)
      return
    }

    setBusy(true)
    try {
      const { error: rsvpError } = await requireSupabase().rpc('submit_invitation_rsvp', {
        invitation_id: invitation.id,
        will_attend: choice === 'confirmed',
        people_count: choice === 'confirmed' ? Number(peopleCount) : 0,
      })
      if (rsvpError) throw rsvpError
      setResponse(choice)
    } catch (rsvpError) {
      setError(rsvpError.message)
    } finally {
      setBusy(false)
    }
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
        {error && <p className="admin-alert" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={busy}>{busy ? 'Aguarde…' : 'Continuar'}</button>
      </form>}

      {guestName && !response && <section className="rsvp-step" aria-live="polite">
        <span className="rsvp-step-label">02 · Sua resposta</span>
        <h2>Olá, {guestName}!</h2>
        <p>Você poderá confirmar sua presença para o nosso grande dia.</p>
        {invitation?.party_size > 1 && <label className="rsvp-label">Quantidade de pessoas
          <select className="rsvp-input" value={peopleCount} onChange={(event) => setPeopleCount(event.target.value)}>
            {Array.from({ length: invitation.party_size }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>}
        {error && <p className="admin-alert" role="alert">{error}</p>}
        <div className="rsvp-actions">
          <button className="button" type="button" disabled={busy} onClick={() => handleResponse('confirmed')}>Confirmar presença</button>
          <button className="button button-muted" type="button" disabled={busy} onClick={() => handleResponse('declined')}>Não poderei comparecer</button>
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
