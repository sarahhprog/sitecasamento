import { useEffect, useState } from 'react'
import { weddingData as defaultWeddingData } from '../data/weddingData'
import { defaultHomeHero } from '../lib/homeHero'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import { WeddingDataContext } from './weddingData'
const editableKeys = new Set(['couple', 'date', 'dateLabel', 'timeLabel', 'venue', 'city'])

export function WeddingDataProvider({ children }) {
  const [data, setData] = useState(defaultWeddingData)
  const [error, setError] = useState('')
  const updateHomeHero = (homeHero) => setData((previous) => ({ ...previous, homeHero }))

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
      const heroSettings = rows?.find((row) => row.key === 'home_hero')?.value
      const homeHero = heroSettings && typeof heroSettings === 'object' && !Array.isArray(heroSettings)
        ? { ...defaultHomeHero, ...heroSettings }
        : defaultHomeHero
      setData({ ...defaultWeddingData, ...updates, homeHero })
    }

    loadSettings().catch((loadError) => {
      if (active) setError(loadError.message)
    })

    return () => { active = false }
  }, [])

  return <WeddingDataContext.Provider value={{ data, error, updateHomeHero }}>{children}</WeddingDataContext.Provider>
}
