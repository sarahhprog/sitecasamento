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
  pending: 'Pagamento pendente. A disponibilidade do presente só mudará após a confirmação segura do Mercado Pago.',
  in_process: 'Pagamento em análise pelo Mercado Pago.',
  rejected: 'O pagamento não foi aprovado. A disponibilidade não foi alterada automaticamente; você pode voltar à lista.',
  cancelled: 'Este pagamento foi cancelado. A disponibilidade do presente não foi alterada automaticamente.',
  expired: 'Este pagamento expirou. A disponibilidade do presente permanece conforme a decisão atual dos noivos.',
  refunded: 'Este pagamento foi reembolsado.',
  charged_back: 'Este pagamento foi contestado junto à instituição financeira.',
  in_mediation: 'Este pagamento está em mediação.',
  unknown: 'Estamos consultando a confirmação do pagamento.',
}

function PagamentoResultado() {
  const [searchParams] = useSearchParams()
  const purchaseId = searchParams.get('purchase') || ''
  const returnHint = searchParams.get('return') || ''
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
        const response = await fetch(`/api/mercado-pago/status?id=${encodeURIComponent(purchaseId)}`, {
          cache: 'no-store',
        })
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

    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') refreshStatus()
    }
    window.addEventListener('focus', refreshOnReturn)
    document.addEventListener('visibilitychange', refreshOnReturn)
    refreshStatus()
    return () => {
      active = false
      window.clearTimeout(timer)
      window.removeEventListener('focus', refreshOnReturn)
      document.removeEventListener('visibilitychange', refreshOnReturn)
    }
  }, [purchaseId, validPurchaseId])

  const errorMessage = validPurchaseId
    ? error
    : 'Não encontramos o identificador deste pagamento.'

  return <PageLayout eyebrow="Lista de presentes" title="Status do pagamento">
    <section className="payment-result" aria-live="polite">
      {errorMessage
        ? <p className="admin-alert" role="alert">{errorMessage}</p>
        : <>
          <p>{statusMessages[status] || statusMessages.unknown}</p>
          {status === 'pending' && returnHint === 'failure' && (
            <p>O checkout não foi concluído. O presente continua disponível; você pode voltar à lista e tentar novamente quando quiser.</p>
          )}
          {status === 'pending' && returnHint === 'success' && (
            <p>O retorno do checkout não confirma o pagamento por si só. Estamos aguardando a validação segura do Mercado Pago.</p>
          )}
        </>}
      <Link className="button" to="/presentes">Voltar à lista de presentes</Link>
    </section>
  </PageLayout>
}

export default PagamentoResultado
