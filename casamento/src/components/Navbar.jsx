import { useState } from 'react'
import { Link } from 'react-router-dom'

const links = [
  ['Página inicial', '/'],
  ['Confirmar presença', '/presenca'],
  ['Lista de presentes', '/presentes'],
  ['Localização e Informações', '/informacoes'],
]

function Navbar({ light = false }) {
  const [open, setOpen] = useState(false)
  return (
    <header className={`navbar ${light ? 'simple-nav' : ''}`}>
      <div className="container nav-inner">
        <Link className="brand" to="/">S & H</Link>
        <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Abrir menu" aria-expanded={open}>☰</button>
        <nav className={`nav-links ${open ? 'open' : ''}`}>
          {links.map(([label, path]) => <Link key={label} to={path} onClick={() => setOpen(false)}>{label}</Link>)}
        </nav>
      </div>
    </header>
  )
}

export default Navbar
