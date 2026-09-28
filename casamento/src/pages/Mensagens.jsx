import { useState } from 'react'
import PageLayout from './PageLayout'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'

function Mensagens() {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function sendMessage(event) {
    event.preventDefault()
    setNotice('')
    setError('')
    setBusy(true)

    try {
      const { error: insertError } = await requireSupabase().from('messages').insert({
        name: name.trim(),
        message: message.trim(),
      })
      if (insertError) throw insertError
      setNotice('Mensagem enviada.')
      setName('')
      setMessage('')
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  return <PageLayout eyebrow="Com carinho" title="Deixe uma mensagem">
    <p className="page-intro">Compartilhe uma mensagem com os noivos.</p>
    {!isSupabaseConfigured && <p className="admin-alert" role="alert">O envio de mensagens ficará disponível após a configuração do Supabase.</p>}
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <form className="rsvp-step message-form" onSubmit={sendMessage}>
      <label className="rsvp-label" htmlFor="message-name">Nome</label>
      <input className="rsvp-input" id="message-name" value={name} onChange={(event) => setName(event.target.value)} maxLength="120" required />
      <label className="rsvp-label" htmlFor="message-content">Mensagem</label>
      <textarea className="rsvp-input" id="message-content" value={message} onChange={(event) => setMessage(event.target.value)} maxLength="3000" rows="5" required />
      <button className="button" type="submit" disabled={busy || !isSupabaseConfigured}>{busy ? 'Enviando…' : 'Enviar'}</button>
    </form>
  </PageLayout>
}

export default Mensagens
