import { Link } from 'react-router-dom'
import PageLayout from './PageLayout'

function TrajesMadrinhas() {
  return <PageLayout eyebrow="Código de vestimenta" title="Trajes das Madrinhas"><p className="page-intro">Orientações especiais para as madrinhas, com liberdade para que cada uma escolha seu estilo dentro da paleta definida.</p><section className="page-card attire-card"><ul className="attire-list"><li>Vestido <strong>longo</strong></li><li>Tons entre <strong>verde menta e verde oliva claro</strong></li><li>As tonalidades podem variar entre as madrinhas</li><li>Salto</li><li>Modelo do vestido livre, respeitando a paleta escolhida</li></ul><Link className="back-link" to="/informacoes">← Voltar para Trajes</Link></section></PageLayout>
}

export default TrajesMadrinhas
