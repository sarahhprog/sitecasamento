import { useEffect, useState } from 'react'

function getCountdown(date) {
  if (!date) return null
  const difference = new Date(date).getTime() - Date.now()
  if (difference <= 0) return null
  return {
    days: Math.floor(difference / 86400000),
    hours: Math.floor((difference / 3600000) % 24),
    minutes: Math.floor((difference / 60000) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  }
}

function Countdown({ date }) {
  const [time, setTime] = useState(() => getCountdown(date))
  useEffect(() => {
    if (!date) return undefined
    const timer = setInterval(() => setTime(getCountdown(date)), 1000)
    return () => clearInterval(timer)
  }, [date])
  if (!time) return <p className="count-placeholder">Chegou o nosso grande dia! 💚</p>
  return <div className="countdown">{Object.entries(time).map(([label, value]) => <div className="count-item" key={label}><strong>{String(value).padStart(2, '0')}</strong><small>{label}</small></div>)}</div>
}

export default Countdown
