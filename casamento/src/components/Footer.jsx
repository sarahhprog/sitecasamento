import { Link } from 'react-router-dom'

function Footer() {
  return <footer className="footer"><div className="container"><div className="footer-top"><div><div className="footer-brand">Sarah & Hayato</div><p className="footer-note">Com carinho, esperamos você.</p></div><Link className="footer-link" to="/admin">Área dos noivos ↗</Link></div><div className="footer-bottom"><span>Sarah & Hayato</span><span>Feito com amor</span></div></div></footer>
}

export default Footer
