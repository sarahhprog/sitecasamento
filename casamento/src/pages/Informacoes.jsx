import PageLayout from './PageLayout'
import LocationSection from '../components/LocationSection'
import { weddingData } from '../data/weddingData'
import { Link } from 'react-router-dom'
function Informacoes() {
  return <PageLayout eyebrow="Planeje sua chegada" title="Informações"><p className="page-intro">Tudo para celebrar conosco: o casamento acontece às {weddingData.timeLabel}, no dia {weddingData.dateLabel.replaceAll('.', '/')}, em {weddingData.venue}.</p><LocationSection /><section className="page-card attire-section"><span className="eyebrow">Código de vestimenta</span><h2>Traje dos convidados</h2><p>Sugerimos o <strong>traje passeio completo</strong>, com roupas sociais e elegantes para a ocasião.</p><p>Para os homens, sugerimos <strong>terno, costume ou outras combinações de roupa social</strong>.</p><p>Para as mulheres, sugerimos <strong>vestidos de festa, vestidos longos ou midi e outras composições sociais elegantes</strong>.</p><div className="attire-note"><h3>Cores</h3><p>Não há uma paleta de cores definida para os convidados. Fiquem à vontade para escolher as cores que preferirem.</p><p>Pedimos apenas que o <strong>branco e os tons muito próximos ao branco sejam reservados à noiva</strong>. 🤍</p></div><div className="attire-cortege"><p>Para quem faz parte do nosso cortejo, preparamos orientações específicas:</p><div className="attire-links"><Link className="button" to="/trajes/padrinhos">Sou Padrinho →</Link><Link className="button button-muted" to="/trajes/madrinhas">Sou Madrinha →</Link></div></div></section></PageLayout>
}
export default Informacoes
