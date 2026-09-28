import { useWeddingData } from '../context/weddingData'

function LocationSection() {
  const { data } = useWeddingData()
  const query = encodeURIComponent(`${data.venue}, ${data.city}`)
  return <section className="location-section"><div className="container location-card"><div><span className="eyebrow">Onde vamos celebrar</span><h2>{data.venue}</h2><p>{data.city}</p><small>O endereço exato será adicionado aqui em breve.</small></div><div className="location-actions"><a className="button" href={`https://www.google.com/maps/search/?api=1&query=${query}`} target="_blank" rel="noreferrer">Google Maps ↗</a><a className="button button-muted" href={`https://www.waze.com/ul?q=${query}&navigate=yes`} target="_blank" rel="noreferrer">Waze ↗</a></div></div></section>
}

export default LocationSection
