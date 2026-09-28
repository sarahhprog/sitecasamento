import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Presenca from './pages/Presenca'
import Presentes from './pages/Presentes'
import Informacoes from './pages/Informacoes'
import Admin from './pages/Admin'
import TrajesPadrinhos from './pages/TrajesPadrinhos'
import TrajesMadrinhas from './pages/TrajesMadrinhas'
import Trajes from './pages/Trajes'
import AdminAuth from './pages/AdminAuth'
import AdminDataPage from './pages/AdminDataPage'
import AdminLayout from './components/AdminLayout'
import AdminRoute from './components/AdminRoute'
import Mensagens from './pages/Mensagens'
import PerguntasFrequentes from './pages/PerguntasFrequentes'
import { AdminAuthProvider } from './context/AdminAuthContext'
import { WeddingDataProvider } from './context/WeddingDataContext'
import { useWeddingData } from './context/weddingData'

function PageTransition({ children }) {
  const location = useLocation()

  return <div className="page-transition" key={location.pathname}>{children}</div>
}

function WeddingSettingsStatus() {
  const { error } = useWeddingData()
  return error ? <p className="site-settings-error" role="status">Algumas informações do casamento não puderam ser atualizadas: {error}</p> : null
}

function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <WeddingDataProvider>
          <WeddingSettingsStatus />
          <PageTransition>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/presenca" element={<Presenca />} />
              <Route path="/presentes" element={<Presentes />} />
              <Route path="/informacoes" element={<Informacoes />} />
              <Route path="/mensagens" element={<Mensagens />} />
              <Route path="/perguntas-frequentes" element={<PerguntasFrequentes />} />
              <Route path="/trajes" element={<Trajes />} />
              <Route path="/trajes/padrinhos" element={<TrajesPadrinhos />} />
              <Route path="/trajes/madrinhas" element={<TrajesMadrinhas />} />
              <Route path="/admin/login" element={<AdminAuth />} />
              <Route path="/admin/cadastro" element={<AdminAuth />} />
              <Route path="/admin/esqueci-senha" element={<AdminAuth />} />
              <Route path="/admin/redefinir-senha" element={<AdminAuth />} />
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Admin />} />
                  <Route path=":resource" element={<AdminDataPage />} />
                </Route>
              </Route>
            </Routes>
          </PageTransition>
        </WeddingDataProvider>
      </AdminAuthProvider>
    </BrowserRouter>
  )
}

export default App
