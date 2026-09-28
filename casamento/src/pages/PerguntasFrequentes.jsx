import { useEffect, useState } from 'react'
import PageLayout from './PageLayout'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'

function PerguntasFrequentes() {
  const [faqs, setFaqs] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    let active = true
    requireSupabase()
      .from('faqs')
      .select('id,question,answer,sort_order')
      .eq('published', true)
      .order('sort_order', { ascending: true })
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) setError(queryError.message)
        else setFaqs(data || [])
        setLoading(false)
      })
      .catch((loadError) => {
        if (!active) return
        setError(loadError.message)
        setLoading(false)
      })
    return () => { active = false }
  }, [])

  return <PageLayout eyebrow="Informações úteis" title="Perguntas frequentes">
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {!isSupabaseConfigured && <p className="page-intro">As perguntas frequentes serão exibidas aqui quando forem cadastradas.</p>}
    {loading ? <p>Carregando…</p> : <div className="faq-list">
      {faqs.map((faq) => <details key={faq.id}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
      {isSupabaseConfigured && faqs.length === 0 && !error && <p>Nenhuma pergunta cadastrada.</p>}
    </div>}
  </PageLayout>
}

export default PerguntasFrequentes
