import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Presenca from './pages/Presenca'
import Presentes from './pages/Presentes'
import Informacoes from './pages/Informacoes'
import Admin from './pages/Admin'
import TrajesPadrinhos from './pages/TrajesPadrinhos'
import TrajesMadrinhas from './pages/TrajesMadrinhas'
import Trajes from './pages/Trajes'

function PageTransition({ children }) {
  const location = useLocation()

  return <div className="page-transition" key={location.pathname}>{children}</div>
}

function App() {
  return (
    <BrowserRouter>
      <PageTransition>
        <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/presenca" element={<Presenca />} />
        <Route path="/presentes" element={<Presentes />} />
        <Route path="/informacoes" element={<Informacoes />} />
        <Route path="/trajes" element={<Trajes />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/trajes/padrinhos" element={<TrajesPadrinhos />} />
        <Route path="/trajes/madrinhas" element={<TrajesMadrinhas />} />
        </Routes>
      </PageTransition>
    </BrowserRouter>
  )
}

export default App
