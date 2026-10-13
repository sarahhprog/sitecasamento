import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageLayout from './PageLayout'

const terminalStatuses = new Set([
  'approved',
  'rejected',
  'cancelled',
  'expired',
  'refunded',
  'charged_back',
  'in_mediation',
])

const statusMessages = {
  approved: 'Pagamento concluído! Obrigado pelo carinho com os noivos.',
  pending: 'Pagamento pendente. Assim que o Mercado Pago atualizar o status, ele aparecerá aqui.',
  in_process: 'Pagamento em análise pelo Mercado Pago.',
  rejected: 'O pagamento não foi aprovado. Você pode tentar novamente pela lista de presentes.',
  cancelled: 'Este pagamento foi cancelado.',
  expired: 'O prazo para concluir este pagamento terminou. O presente voltou a ficar disponível.',
  refunded: 'Este pagamento foi reembolsado.',
  charged_back: 'Este pagamento foi contestado junto à instituição financeira.',
  in_mediation: 'Este pagamento está em mediação.',
  unknown: 'Estamos consultando a confirmação do pagamento.',
}

function PagamentoResultado() {
  const [searchParams] = useSearchParams()
  const purchaseId = searchParams.get('purchase') || ''
  const validPurchaseId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(purchaseId)
  const [status, setStatus] = useState('unknown')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let timer
    let attempts = 0

    async function refreshStatus() {
      attempts += 1
      try {
        const response = await fetch(`/api/mercado-pago/status?id=${encodeURIComponent(purchaseId)}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o pagamento.')
        if (!active) return

        setStatus(data.status || 'unknown')
        setError('')
        if (terminalStatuses.has(data.status) || attempts >= 40) return
      } catch (loadError) {
        if (!active) return
        setError(loadError.message || 'Não foi possível consultar o pagamento.')
        if (attempts >= 40) return
      }

      if (active) timer = window.setTimeout(refreshStatus, 3000)
    }

    if (!validPurchaseId) return () => { active = false }

    refreshStatus()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [purchaseId, validPurchaseId])

  const errorMessage = validPurchaseId
    ? error
    : 'Não encontramos o identificador deste pagamento.'

  return <PageLayout eyebrow="Lista de presentes" title="Status do pagamento">
    <section className="payment-result" aria-live="polite">
      {errorMessage
        ? <p className="admin-alert" role="alert">{errorMessage}</p>
        : <p>{statusMessages[status] || statusMessages.unknown}</p>}
      <Link className="button" to="/presentes">Voltar à lista de presentes</Link>
    </section>
  </PageLayout>
}

export default PagamentoResultado
