import { Link } from 'react-router-dom'

const cards = [
  ['01', 'Confirmar presença', '/presenca'],
  ['02', 'Lista de presentes', '/presentes'],
  ['03', 'Localização e Informações', '/informacoes'],
]

function QuickLinks() {
  return <section className="quick-links"><div className="container quick-grid">{cards.map(([number, title, path]) => <Link className="quick-card" to={path} key={title}><div><span>{number}</span><h3>{title}</h3></div></Link>)}</div></section>
}

export default QuickLinks
