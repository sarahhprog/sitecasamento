import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAdminAuth } from '../context/adminAuth'

const navigation = [
  ['Dashboard', '/admin'],
  ['Convidados', '/admin/convidados'],
  ['Presentes', '/admin/presentes'],
  ['Pagamentos', '/admin/pagamentos'],
  ['Histórico de presentes', '/admin/historico_presentes'],
  ['Mensagens', '/admin/mensagens'],
  ['Fotos / Galeria', '/admin/fotos'],
  ['Localização e Informações', '/admin/informacoes'],
  ['FAQ', '/admin/faq'],
  ['Configurações', '/admin/configuracoes'],
]

function AdminLayout() {
  const { signOut } = useAdminAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  async function handleSignOut() {
    setError('')
    try {
      await signOut()
      navigate('/admin/login', { replace: true })
    } catch (signOutError) {
      setError(signOutError.message)
    }
  }

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand">Sarah & Hayato<span>Área dos noivos</span></div>
      <nav aria-label="Menu administrativo">
        {navigation.map(([label, path]) => <NavLink end={path === '/admin'} key={path} to={path}>{label}</NavLink>)}
      </nav>
      <button className="admin-logout" type="button" onClick={handleSignOut}>Sair</button>
    </aside>
    <main className="admin-content">{error && <p className="admin-alert" role="alert">{error}</p>}<Outlet /></main>
  </div>
}

export default AdminLayout
