import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAdminAuth } from '../context/adminAuth'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'

const titles = {
  login: 'Entrar na área dos noivos',
  cadastro: 'Criar conta',
  'esqueci-senha': 'Recuperar senha',
  'redefinir-senha': 'Criar nova senha',
}

function AdminAuth() {
  const { action } = useParams()
  const location = useLocation()
  const routeAction = action || location.pathname.split('/').at(-1)
  const mode = titles[routeAction] ? routeAction : 'login'
  const { signIn, error: authContextError, clearError } = useAdminAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [registrationEmail, setRegistrationEmail] = useState('')
  const [copiedBootstrapSql, setCopiedBootstrapSql] = useState(false)
  const bootstrapSql = registrationEmail
    ? `update public.profiles\nset role = 'admin'\nwhere id = (\n  select id from auth.users where lower(email) = lower('${registrationEmail.replaceAll("'", "''")}')\n);`
    : ''

  function updateField(event) {
    setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)

    try {
      const client = requireSupabase()
      if (mode === 'login') {
        await signIn(form.email, form.password)
        navigate(location.state?.from?.pathname || '/admin', { replace: true })
      } else if (mode === 'cadastro') {
        if (form.password !== form.confirmPassword) throw new Error('As senhas não conferem.')
        const { error: signUpError } = await client.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: { full_name: form.name },
            emailRedirectTo: `${window.location.origin}/admin/login`,
          },
        })
        if (signUpError) throw signUpError
        setRegistrationEmail(form.email.trim())
        setNotice('Conta criada. Confirme o e-mail, depois execute no SQL Editor do Supabase o comando abaixo para liberar o primeiro acesso administrativo. Em seguida, entre com este e-mail e senha.')
      } else if (mode === 'esqueci-senha') {
        const { error: recoveryError } = await client.auth.resetPasswordForEmail(form.email, {
          redirectTo: `${window.location.origin}/admin/redefinir-senha`,
        })
        if (recoveryError) throw recoveryError
        setNotice('Se o e-mail estiver cadastrado, você receberá um link seguro para redefinir a senha.')
      } else {
        if (form.password !== form.confirmPassword) throw new Error('As senhas não conferem.')
        const { error: passwordError } = await client.auth.updateUser({ password: form.password })
        if (passwordError) throw passwordError
        setNotice('Senha atualizada. Você já pode entrar com a nova senha.')
        await client.auth.signOut()
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setBusy(false)
    }
  }

  async function copyBootstrapSql() {
    setError('')
    try {
      await navigator.clipboard.writeText(bootstrapSql)
      setCopiedBootstrapSql(true)
    } catch (copyError) {
      setError(`Não foi possível copiar o comando: ${copyError.message}`)
    }
  }

  const accessDenied = location.state?.accessDenied
  const shownError = error || (accessDenied ? 'Esta conta ainda não tem autorização de administrador. Depois de criá-la, execute no SQL Editor do Supabase o comando de promoção exibido na tela de cadastro.' : authContextError)

  return <main className="admin-auth-page">
    <section className="admin-auth-panel">
      <Link className="admin-auth-brand" to="/">Sarah & Hayato</Link>
      <span className="eyebrow">Área dos noivos</span>
      <h1>{titles[mode]}</h1>
      {!isSupabaseConfigured && <p className="admin-alert" role="alert">Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local e reinicie o servidor.</p>}
      {shownError && <p className="admin-alert" role="alert">{shownError}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {registrationEmail && <div className="admin-bootstrap">
        <p>Promoção segura do primeiro administrador:</p>
        <pre>{bootstrapSql}</pre>
        <button className="button button-muted" type="button" onClick={copyBootstrapSql}>
          {copiedBootstrapSql ? 'SQL copiado' : 'Copiar comando SQL'}
        </button>
        <p className="admin-bootstrap-note">Execute este comando uma única vez no Supabase → SQL Editor. Não compartilhe nem publique este comando.</p>
      </div>}
      <form className="admin-auth-form" onSubmit={handleSubmit}>
        {mode === 'cadastro' && <label>Nome<input name="name" value={form.name} onChange={updateField} autoComplete="name" required /></label>}
        {mode !== 'redefinir-senha' && <label>E-mail<input name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" required /></label>}
        {(mode === 'login' || mode === 'cadastro' || mode === 'redefinir-senha') && <>
          <label>Senha<input name="password" type="password" value={form.password} onChange={updateField} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength="8" required /></label>
          {mode !== 'login' && <label>Confirmar senha<input name="confirmPassword" type="password" value={form.confirmPassword} onChange={updateField} autoComplete="new-password" minLength="8" required /></label>}
        </>}
        <button className="button" type="submit" disabled={busy || !isSupabaseConfigured}>
          {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : mode === 'cadastro' ? 'Criar conta' : mode === 'esqueci-senha' ? 'Enviar link seguro' : 'Salvar nova senha'}
        </button>
      </form>
      <nav className="admin-auth-links" aria-label="Opções da conta">
        {mode !== 'login' && <Link to="/admin/login" onClick={clearError}>Voltar ao login</Link>}
        {mode === 'login' && <Link to="/admin/esqueci-senha">Esqueci minha senha</Link>}
        {mode === 'login' && <Link to="/admin/cadastro">Criar conta</Link>}
      </nav>
      <Link className="admin-back-link" to="/">Voltar ao site</Link>
    </section>
  </main>
}

export default AdminAuth
