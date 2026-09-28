import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'

import { AdminAuthContext } from './adminAuth'

export function AdminAuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined

    const client = requireSupabase()
    let active = true

    async function syncSession(nextSession) {
      if (!active) return
      setSession(nextSession)
      setIsAdmin(false)
      setError('')

      if (!nextSession?.user) {
        setLoading(false)
        return
      }

      setLoading(true)
      const { data, error: profileError } = await client
        .from('profiles')
        .select('role')
        .eq('id', nextSession.user.id)
        .single()

      if (!active) return
      if (profileError) {
        setError(profileError.message)
      } else {
        setIsAdmin(data.role === 'admin')
      }
      setLoading(false)
    }

    client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) {
        setError(sessionError.message)
        setLoading(false)
        return
      }
      syncSession(data.session)
    })

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => syncSession(nextSession), 0)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({
    session,
    isAdmin,
    loading,
    error,
    clearError: () => setError(''),
    signIn: async (email, password) => {
      const client = requireSupabase()
      setLoading(true)
      const { data, error: authError } = await client.auth.signInWithPassword({ email, password })
      if (authError) {
        setLoading(false)
        throw authError
      }
      setSession(data.session)

      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()
      if (profileError) {
        setIsAdmin(false)
        setError(profileError.message)
        setLoading(false)
        throw profileError
      }

      setIsAdmin(profile.role === 'admin')
      setError('')
      setLoading(false)
    },
    signOut: async () => {
      const { error: authError } = await requireSupabase().auth.signOut()
      if (authError) throw authError
    },
  }), [session, isAdmin, loading, error])

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}
