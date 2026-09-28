import { useEffect, useState } from 'react'
import { weddingData as defaultWeddingData } from '../data/weddingData'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import { WeddingDataContext } from './weddingData'
const editableKeys = new Set(['couple', 'date', 'dateLabel', 'timeLabel', 'venue', 'city'])

export function WeddingDataProvider({ children }) {
  const [data, setData] = useState(defaultWeddingData)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    let active = true

    async function loadSettings() {
      const { data: rows, error: queryError } = await requireSupabase()
        .from('wedding_settings')
        .select('key,value')
        .eq('is_public', true)

      if (!active) return
      if (queryError) {
        setError(queryError.message)
        return
      }

      const updates = Object.fromEntries(
        (rows || [])
          .filter((row) => editableKeys.has(row.key))
          .map((row) => [row.key, row.value]),
      )
      setData({ ...defaultWeddingData, ...updates })
    }

    loadSettings().catch((loadError) => {
      if (active) setError(loadError.message)
    })

    return () => { active = false }
  }, [])

  return <WeddingDataContext.Provider value={{ data, error }}>{children}</WeddingDataContext.Provider>
}
