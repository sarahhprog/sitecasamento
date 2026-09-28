import { useEffect, useState } from 'react'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'

function Gallery({ images }) {
  const [photos, setPhotos] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined
    let active = true
    requireSupabase()
      .from('photos')
      .select('id,title,file_url,file_type,category')
      .eq('visible', true)
      .in('file_type', ['image/jpeg', 'image/png', 'image/webp'])
      .order('sort_order', { ascending: true })
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) setError(queryError.message)
        else setPhotos(data || [])
      })
      .catch((loadError) => {
        if (active) setError(loadError.message)
      })
    return () => { active = false }
  }, [])

  const frames = isSupabaseConfigured ? photos : images.map((_, index) => ({ id: index, file_url: null, title: '' }))

  return <section className="section gallery-section"><div className="container"><div className="section-heading"><span className="eyebrow">Alguns momentos</span><h2>Memórias que guardamos</h2><p>Uma pequena coleção de instantes especiais. Em breve, este espaço receberá nossas fotos favoritas.</p></div>{error && <p className="admin-alert" role="alert">{error}</p>}<div className="gallery">{frames.map((photo, index) => <figure className={`gallery-frame gallery-frame-${index + 1}`} key={photo.id}>{photo.file_url && <img src={photo.file_url} alt={photo.title || `Momento do casal ${index + 1}`} />}</figure>)}</div></div></section>
}

export default Gallery
