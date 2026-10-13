import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { requireSupabase } from '../lib/supabase'
import HomeHeroSettings from './HomeHeroSettings'

function getStorageObjectPath(url) {
  const marker = '/storage/v1/object/public/wedding-assets/'
  const markerIndex = url.indexOf(marker)
  return markerIndex === -1 ? null : decodeURIComponent(url.slice(markerIndex + marker.length))
}

const resources = {
  convidados: {
    title: 'Convidados',
    table: 'guests',
    fields: [
      { name: 'name', label: 'Nome', required: true },
      { name: 'invite_code', label: 'Código do convite', required: true },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'phone', label: 'Telefone' },
      { name: 'party_size', label: 'Pessoas no convite', type: 'number', required: true },
      { name: 'companions', label: 'Acompanhantes (JSON)', type: 'textarea', serialize: 'json' },
      { name: 'rsvp_status', label: 'RSVP', type: 'select', options: [['pending', 'Aguardando resposta'], ['confirmed', 'Confirmado'], ['declined', 'Não poderá comparecer']] },
      { name: 'confirmed_people', label: 'Pessoas confirmadas', type: 'number' },
      { name: 'notes', label: 'Observações', type: 'textarea' },
    ],
    columns: ['name', 'invite_code', 'party_size', 'rsvp_status', 'confirmed_people', 'responded_at'],
  },
  presentes: {
    title: 'Presentes',
    table: 'gifts',
    fields: [
      { name: 'name', label: 'Nome do presente', required: true },
      { name: 'description', label: 'Descrição', type: 'textarea' },
      { name: 'value', label: 'Valor', type: 'number', required: true, step: '0.01' },
      { name: 'category', label: 'Categoria' },
      { name: 'available', label: 'Disponível', type: 'checkbox' },
      { name: 'public_visible', label: 'Exibir no site público', type: 'checkbox' },
      { name: 'upload', label: 'Foto do presente (JPG, PNG ou WEBP)', type: 'file', accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp' },
      { name: 'remove_file', label: 'Remover arquivo atual', type: 'checkbox' },
      { name: 'payment_link', label: 'Link de pagamento futuro', type: 'url' },
      { name: 'payment_identifier', label: 'Identificador de pagamento futuro' },
    ],
    columns: ['name', 'value', 'category', 'available', 'public_visible', 'file_type'],
  },
  mensagens: {
    title: 'Mensagens recebidas',
    table: 'messages',
    readOnly: true,
    columns: ['name', 'message', 'created_at'],
  },
  pagamentos: {
    title: 'Pagamentos de presentes',
    table: 'gift_payments',
    readOnly: true,
    preventCreate: true,
    preventDelete: true,
    hideActions: true,
    columns: ['guest_name', 'message', 'gift_name', 'amount', 'created_at', 'payment_status'],
    labels: {
      guest_name: 'Nome do convidado',
      message: 'Mensagem',
      gift_name: 'Presente',
      amount: 'Valor',
      created_at: 'Data e horário da contribuição',
      payment_status: 'Status do pagamento',
    },
    formatters: {
      amount: (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value),
      payment_status: (value, item) => {
        if (value === 'pending'
          && item?.reservation_expires_at
          && new Date(item.reservation_expires_at).getTime() <= Date.now()) {
          return 'Expirado'
        }
        return ({
        pending: 'Pendente',
        in_process: 'Pendente',
        approved: 'Aprovado',
        rejected: 'Recusado',
        cancelled: 'Cancelado',
        expired: 'Expirado',
        refunded: 'Reembolsado',
        charged_back: 'Contestado',
        in_mediation: 'Em mediação',
        unknown: 'Pendente de confirmação',
        })[value] || value
      },
      created_at: (value, item) => {
        const contributionDate = item?.paid_at || value
        return contributionDate ? new Date(contributionDate).toLocaleString('pt-BR') : '—'
      },
    },
  },
  fotos: {
    title: 'Fotos / Galeria',
    table: 'photos',
    fields: [
      { name: 'title', label: 'Título' },
      { name: 'category', label: 'Categoria', type: 'select', options: [['nossa-historia', 'Nossa história'], ['o-pedido', 'O pedido'], ['momentos-especiais', 'Momentos especiais'], ['casamento', 'Casamento']] },
      { name: 'visible', label: 'Publicar na galeria', type: 'checkbox' },
      { name: 'sort_order', label: 'Ordem', type: 'number' },
      { name: 'upload', label: 'Imagem ou PDF', type: 'file', accept: '.jpg,.jpeg,.png,.webp,.pdf', required: true },
    ],
    columns: ['title', 'category', 'file_type', 'visible', 'sort_order'],
  },
  informacoes: {
    title: 'Localização e Informações',
    table: 'wedding_settings',
    key: 'key',
    preventCreate: true,
    preventDelete: true,
    fields: [
      { name: 'key', label: 'Informação', type: 'select', options: [['couple', 'Nomes do casal'], ['date', 'Data e horário (ISO)'], ['dateLabel', 'Data exibida'], ['timeLabel', 'Horário exibido'], ['venue', 'Local do casamento'], ['city', 'Cidade']], required: true },
      { name: 'value', label: 'Conteúdo', required: true },
      { name: 'is_public', label: 'Disponível no site público', type: 'checkbox' },
    ],
    columns: ['key', 'value', 'is_public', 'updated_at'],
  },
  faq: {
    title: 'Perguntas frequentes',
    table: 'faqs',
    fields: [
      { name: 'question', label: 'Pergunta', required: true },
      { name: 'answer', label: 'Resposta', type: 'textarea' },
      { name: 'sort_order', label: 'Ordem', type: 'number' },
      { name: 'published', label: 'Publicar', type: 'checkbox' },
    ],
    columns: ['question', 'answer', 'sort_order', 'published'],
  },
}

resources.configuracoes = { ...resources.informacoes, title: 'Configurações do site' }

const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function AdminDataPage() {
  const { resource = '' } = useParams()
  const config = resources[resource]
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState(null)
  const [draft, setDraft] = useState({})
  const [selectedFile, setSelectedFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const selectedFilePreview = useMemo(() => selectedFile ? URL.createObjectURL(selectedFile) : '', [selectedFile])

  useEffect(() => () => {
    if (selectedFilePreview) URL.revokeObjectURL(selectedFilePreview)
  }, [selectedFilePreview])

  const loadItems = useCallback(async () => {
    if (!config) return
    try {
      const { data, error: queryError } = await requireSupabase()
        .from(config.table)
        .select('*')
        .order(config.key || 'created_at', { ascending: false })

      if (queryError) setError(queryError.message)
      else setItems(data || [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    if (resource === 'configuracoes') return undefined
    loadItems()
    return undefined
  }, [loadItems, resource])

  const fields = useMemo(() => config?.fields || [], [config])

  function startCreate() {
    const initial = Object.fromEntries(fields.filter((field) => field.type !== 'file').map((field) => [
      field.name,
      field.type === 'checkbox' ? false : field.serialize === 'json' ? '{}' : '',
    ]))
    if (resource === 'convidados') Object.assign(initial, { party_size: 1, confirmed_people: 0, companions: '[]' })
    if (resource === 'presentes') Object.assign(initial, { value: 0, available: true, public_visible: true, remove_file: false })
    if (resource === 'fotos') Object.assign(initial, { visible: false, sort_order: 0 })
    if (resource === 'faq') Object.assign(initial, { published: false, sort_order: 0 })
    if (['informacoes', 'configuracoes'].includes(resource)) Object.assign(initial, { key: 'couple', is_public: true })
    setDraft(initial)
    setSelectedFile(null)
    setEditor({ id: null })
    setError('')
    setNotice('')
  }

  function startEdit(item) {
    const initial = Object.fromEntries(fields
      .filter((field) => field.type !== 'file')
      .map((field) => [field.name, field.serialize === 'json' ? JSON.stringify(item[field.name] ?? {}) : (item[field.name] ?? '')]))
    setDraft(initial)
    setSelectedFile(null)
    setEditor({ id: item.id || item.key })
    setError('')
    setNotice('')
  }

  function updateField(event) {
    const { name, type, checked, value, files } = event.target
    if (type === 'file') {
      setSelectedFile(files?.[0] || null)
      return
    }
    setDraft((previous) => ({ ...previous, [name]: type === 'checkbox' ? checked : value }))
  }

  async function uploadSelectedFile() {
    if (!selectedFile) return null
    if (!acceptedTypes.has(selectedFile.type)) throw new Error('Use JPG, JPEG, PNG, WEBP ou PDF.')
    if (selectedFile.size > 10 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 10 MB.')

    const client = requireSupabase()
    const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `${resource}/${crypto.randomUUID()}-${safeName}`
    const { error: uploadError } = await client.storage.from('wedding-assets').upload(path, selectedFile, { upsert: false })
    if (uploadError) throw uploadError
    const { data } = client.storage.from('wedding-assets').getPublicUrl(path)
    return { url: data.publicUrl, type: selectedFile.type }
  }

  async function saveItem(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = { ...draft, updated_at: new Date().toISOString() }
      for (const field of fields) {
        if (field.type === 'file' || field.name === 'remove_file') {
          delete payload[field.name]
          continue
        }
        if (field.serialize === 'json') payload[field.name] = JSON.parse(payload[field.name] || '{}')
        if (field.type === 'number') payload[field.name] = Number(payload[field.name] || 0)
      }

      const uploaded = await uploadSelectedFile()
      if (resource === 'presentes' && draft.remove_file && !uploaded) {
        payload.file_url = null
        payload.file_type = null
        payload.image_url = null
      }
      if (uploaded && resource === 'presentes') {
        payload.file_url = uploaded.url
        payload.file_type = uploaded.type
        payload.image_url = uploaded.type.startsWith('image/') ? uploaded.url : null
      }
      if (uploaded && resource === 'fotos') {
        payload.file_url = uploaded.url
        payload.file_type = uploaded.type
      }

      const client = requireSupabase()
      const table = client.from(config.table)
      const currentRecord = editor.id ? items.find((item) => (item.id || item.key) === editor.id) : null
      const result = editor.id
        ? await table.update(payload).eq(config.key || 'id', editor.id)
        : await table.insert({
          ...payload,
          ...(['presentes', 'fotos'].includes(resource) ? { admin_id: (await client.auth.getUser()).data.user.id } : {}),
        })
      if (result.error) throw result.error
      if (uploaded || (resource === 'presentes' && draft.remove_file)) {
        const oldPath = currentRecord?.file_url ? getStorageObjectPath(currentRecord.file_url) : null
        if (oldPath) {
          const { error: cleanupError } = await client.storage.from('wedding-assets').remove([oldPath])
          if (cleanupError) throw cleanupError
        }
      }
      setNotice(editor.id ? 'Alterações salvas.' : 'Item criado.')
      setEditor(null)
      await loadItems()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteItem(item) {
    const identifier = item.id || item.key
    if (!window.confirm('Deseja excluir este item?')) return
    setError('')
    setNotice('')
    const client = requireSupabase()
    const { error: deleteError } = await client.from(config.table).delete().eq(config.key || 'id', identifier)
    if (deleteError) setError(deleteError.message)
    else {
      if (item.file_url) {
        const objectPath = getStorageObjectPath(item.file_url)
        if (objectPath) {
          const { error: cleanupError } = await client.storage.from('wedding-assets').remove([objectPath])
          if (cleanupError) {
            setError(`Registro excluído, mas não foi possível remover o arquivo: ${cleanupError.message}`)
            await loadItems()
            return
          }
        }
      }
      setNotice('Item excluído.')
      await loadItems()
    }
  }

  if (!config) return <p className="admin-alert">Esta seção administrativa não foi encontrada.</p>
  if (resource === 'configuracoes') return <HomeHeroSettings />

  return <section className="admin-resource">
    <div className="admin-resource-heading">
      <div><span className="eyebrow">Área dos noivos</span><h1>{config.title}</h1></div>
      {!config.readOnly && !config.preventCreate && <button className="button" type="button" onClick={startCreate}>+ Criar {resource === 'presentes' ? 'presente' : 'item'}</button>}
    </div>
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {editor && <form className="admin-edit-form" onSubmit={saveItem}>
      <h2>{editor.id ? 'Editar item' : 'Criar item'}</h2>
      <div className="admin-form-grid">
        {fields.map((field) => <label className={field.type === 'textarea' ? 'admin-field-wide' : ''} key={field.name}>
          {field.label}
          {field.type === 'textarea'
            ? <textarea name={field.name} value={draft[field.name] ?? ''} onChange={updateField} required={field.required} rows="4" />
            : field.type === 'select'
              ? <select name={field.name} value={draft[field.name] ?? ''} onChange={updateField} required={field.required}>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              : <input name={field.name} type={field.type || 'text'} value={field.type === 'file' ? undefined : draft[field.name] ?? ''} checked={field.type === 'checkbox' ? Boolean(draft[field.name]) : undefined} onChange={updateField} required={field.required && field.type !== 'file'} accept={field.accept} min={field.type === 'number' ? 0 : undefined} step={field.step} />}
        </label>)}
      </div>
      {selectedFile && <p className="admin-file-preview">{selectedFile.type.startsWith('image/') ? <img src={selectedFilePreview} alt="Pré-visualização do arquivo" /> : selectedFile.name}</p>}
      {editor.id && ['presentes', 'fotos'].includes(resource) && items.find((item) => (item.id || item.key) === editor.id)?.file_url && <p className="admin-file-preview">Arquivo atual: <a href={items.find((item) => (item.id || item.key) === editor.id).file_url} target="_blank" rel="noreferrer">visualizar arquivo</a></p>}
      <div className="admin-form-actions">
        <button className="button" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        <button className="button button-muted" type="button" onClick={() => setEditor(null)}>Cancelar</button>
      </div>
    </form>}
    {loading ? <p>Carregando…</p> : items.length === 0
      ? <p className="admin-empty">Nenhum registro cadastrado.</p>
      : <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr>{config.columns.map((column) => <th key={column}>{config.labels?.[column] || column.replaceAll('_', ' ')}</th>)}{!config.hideActions && <th>Ações</th>}</tr></thead>
        <tbody>{items.map((item) => <tr key={item.id || item.key}>
          {config.columns.map((column) => <td key={column}>{config.formatters?.[column] && item[column] ? config.formatters[column](item[column], item) : displayValue(item[column])}</td>)}
          {!config.hideActions && <td className="admin-row-actions">{!config.readOnly && <button type="button" onClick={() => startEdit(item)}>Editar</button>}{!config.preventDelete && <button type="button" onClick={() => deleteItem(item)}>Excluir</button>}</td>}
        </tr>)}</tbody>
      </table></div>}
  </section>
}

export default AdminDataPage
