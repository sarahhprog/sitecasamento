import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { requireSupabase } from '../lib/supabase'

const statistics = [
  { label: 'Convidados', table: 'guests', to: '/admin/convidados' },
  { label: 'Confirmados', table: 'guests', filter: ['rsvp_status', 'confirmed'], to: '/admin/convidados' },
  { label: 'Pendentes', table: 'guests', filter: ['rsvp_status', 'pending'], to: '/admin/convidados' },
  { label: 'Não comparecerão', table: 'guests', filter: ['rsvp_status', 'declined'], to: '/admin/convidados' },
  { label: 'Presentes', table: 'gifts', to: '/admin/presentes' },
  { label: 'Mensagens', table: 'messages', to: '/admin/mensagens' },
  { label: 'Fotos', table: 'photos', to: '/admin/fotos' },
]

function Admin() {
  const [counts, setCounts] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadCounts() {
      const client = requireSupabase()
      const results = await Promise.all(statistics.map(async (item) => {
        let query = client.from(item.table).select('id', { count: 'exact', head: true })
        if (item.filter) query = query.eq(item.filter[0], item.filter[1])
        const result = await query
        return { label: item.label, count: result.count, error: result.error }
      }))

      if (!active) return
      const failed = results.find((result) => result.error)
      if (failed) setError(failed.error.message)
      else setCounts(Object.fromEntries(results.map(({ label, count }) => [label, count])))
      setLoading(false)
    }

    loadCounts().catch((loadError) => {
      if (!active) return
      setError(loadError.message)
      setLoading(false)
    })

    return () => { active = false }
  }, [])

  return <section className="admin-dashboard">
    <span className="eyebrow">Sarah & Hayato</span>
    <h1>Dashboard</h1>
    <p className="admin-page-intro">Resumo da organização do casamento.</p>
    {error && <p className="admin-alert" role="alert">{error}</p>}
    <div className="admin-stat-grid">
      {statistics.map(({ label, to }) => <Link className="admin-stat" to={to} key={label}>
        <span>{label}</span>
        <strong>{loading ? '—' : counts[label] ?? 0}</strong>
      </Link>)}
    </div>
    <div className="admin-shortcuts">
      <Link className="button" to="/admin/presentes">Gerenciar presentes</Link>
      <Link className="button button-muted" to="/admin/convidados">Gerenciar convidados</Link>
    </div>
  </section>
}

export default Admin
