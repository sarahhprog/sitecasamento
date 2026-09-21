import { Link } from 'react-router-dom'
import PageLayout from './PageLayout'

function Trajes() {
  return <PageLayout eyebrow="Código de vestimenta" title="Trajes">
    <p className="page-intro">Preparamos algumas orientações para que o cortejo mantenha a harmonia da celebração, sempre com espaço para cada pessoa escolher seu próprio estilo.</p>
    <section className="page-card attire-card">
      <div className="attire-columns">
        <div className="attire-block">
          <h3>Padrinhos</h3>
          <p>Terno completo em cinza escuro, camisa branca e sapato social preto.</p>
          <Link className="back-link" to="/trajes/padrinhos">Ver orientações →</Link>
        </div>
        <div className="attire-block">
          <h3>Madrinhas</h3>
          <p>Vestidos longos em tons entre verde menta e verde oliva claro.</p>
          <Link className="back-link" to="/trajes/madrinhas">Ver orientações →</Link>
        </div>
      </div>
    </section>
  </PageLayout>
}

export default Trajes
