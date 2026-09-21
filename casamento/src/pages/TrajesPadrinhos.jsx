import { Link } from 'react-router-dom'
import PageLayout from './PageLayout'

function TrajesPadrinhos() {
  return <PageLayout eyebrow="Código de vestimenta" title="Trajes dos Padrinhos"><p className="page-intro">Orientações especiais para os padrinhos, pensadas para manter uma composição elegante e harmônica.</p><section className="page-card attire-card"><ul className="attire-list"><li>Terno completo</li><li>Terno na cor <strong>cinza escuro</strong></li><li>Camisa <strong>branca</strong></li><li>Sapato social <strong>preto</strong></li></ul><Link className="back-link" to="/informacoes">← Voltar para Trajes</Link></section></PageLayout>
}

export default TrajesPadrinhos
