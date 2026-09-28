import Countdown from './Countdown'
import { useWeddingData } from '../context/weddingData'

function Hero() {
  const { data } = useWeddingData()
  return <section className="hero"><div className="hero-info"><div className="hero-foliage" aria-hidden="true" /><div className="container hero-content"><span className="eyebrow">Uma nova história começa aqui</span><h1>{data.couple}</h1><p className="hero-subtitle">Nosso grande dia</p><div className="hero-details"><strong>{data.dateLabel}</strong><span>{data.timeLabel}</span><span className="hero-divider" /><span>{data.venue}</span><span>{data.city}</span></div><Countdown date={data.date} /></div></div><div className="hero-photo" aria-hidden="true" /></section>
}

export default Hero
