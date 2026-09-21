import Countdown from './Countdown'
import { weddingData } from '../data/weddingData'

function Hero() {
  return <section className="hero"><div className="hero-info"><div className="hero-foliage" aria-hidden="true" /><div className="container hero-content"><span className="eyebrow">Uma nova história começa aqui</span><h1>{weddingData.couple}</h1><p className="hero-subtitle">Nosso grande dia</p><div className="hero-details"><strong>{weddingData.dateLabel}</strong><span>{weddingData.timeLabel}</span><span className="hero-divider" /><span>{weddingData.venue}</span><span>{weddingData.city}</span></div><Countdown date={weddingData.date} /></div></div><div className="hero-photo" role="img" aria-label="Imagem temporária de um momento romântico" /></section>
}

export default Hero
