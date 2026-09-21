import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

function PageLayout({ eyebrow, title, children }) {
  return <div className="page"><Navbar light /><main className="page-main"><div className="container"><span className="eyebrow">{eyebrow}</span><h1 className="display">{title}</h1>{children}</div></main><Footer /></div>
}

export default PageLayout
