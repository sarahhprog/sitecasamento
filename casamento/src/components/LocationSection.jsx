import { weddingData } from '../data/weddingData'

function LocationSection() {
  const query = encodeURIComponent(`${weddingData.venue}, ${weddingData.city}`)
  return <section className="location-section"><div className="container location-card"><div><span className="eyebrow">Onde vamos celebrar</span><h2>{weddingData.venue}</h2><p>{weddingData.city}</p><small>O endereço exato será adicionado aqui em breve.</small></div><div className="location-actions"><a className="button" href={`https://www.google.com/maps/search/?api=1&query=${query}`} target="_blank" rel="noreferrer">Google Maps ↗</a><a className="button button-muted" href={`https://www.waze.com/ul?q=${query}&navigate=yes`} target="_blank" rel="noreferrer">Waze ↗</a></div></div></section>
}

export default LocationSection
