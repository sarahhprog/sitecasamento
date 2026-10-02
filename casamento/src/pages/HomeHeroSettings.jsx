import { useEffect, useMemo, useRef, useState } from 'react'
import Countdown from '../components/Countdown'
import { useWeddingData } from '../context/weddingData'
import { defaultHomeHero, getHomeHeroBackgroundStyle } from '../lib/homeHero'
import { requireSupabase } from '../lib/supabase'

const imageTypes = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
])

function getImageContentType(file) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  const expectedType = imageTypes.get(extension)
  if (!expectedType || (file.type && file.type !== expectedType)) {
    throw new Error('Escolha uma imagem JPG, JPEG, PNG ou WEBP.')
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('A imagem deve ter no máximo 10 MB.')
  }
  return expectedType
}

function HomeHeroSettings() {
  const { data: publicWeddingData, updateHomeHero } = useWeddingData()
  const [settings, setSettings] = useState({ ...defaultHomeHero })
  const [selectedFile, setSelectedFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false)
  const [pendingRemovalPath, setPendingRemovalPath] = useState('')
  const fileInput = useRef(null)
  const filePreview = useMemo(() => selectedFile ? URL.createObjectURL(selectedFile) : '', [selectedFile])

  useEffect(() => () => {
    if (filePreview) URL.revokeObjectURL(filePreview)
  }, [filePreview])

  useEffect(() => {
    let active = true

    async function loadSettings() {
      try {
        const { data, error: queryError } = await requireSupabase()
          .from('wedding_settings')
          .select('value')
          .eq('key', 'home_hero')
          .maybeSingle()

        if (queryError) throw queryError
        if (active && data?.value && typeof data.value === 'object' && !Array.isArray(data.value)) {
          setSettings({ ...defaultHomeHero, ...data.value })
        }
      } catch (loadError) {
        if (active) setError(loadError.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadSettings()
    return () => { active = false }
  }, [])

  function updateSetting(event) {
    const { name, value, checked, type } = event.target
    setSettings((previous) => ({ ...previous, [name]: type === 'checkbox' ? checked : value }))
    setError('')
    setNotice('')
  }

  function selectFile(event) {
    setSelectedFile(event.target.files?.[0] || null)
    setRemoveCurrentImage(false)
    setError('')
    setNotice('')
  }

  function discardSavedImage() {
    setPendingRemovalPath(settings.imagePath)
    setSettings((previous) => ({ ...previous, imageUrl: '', imagePath: '', backgroundType: 'color' }))
    setSelectedFile(null)
    setRemoveCurrentImage(true)
    if (fileInput.current) fileInput.current.value = ''
    setError('')
    setNotice('')
  }

  async function saveSettings(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    let uploadedPath = ''
    let client
    const previousImagePath = settings.imagePath || pendingRemovalPath

    try {
      client = requireSupabase()
      const nextSettings = { ...settings }
      if (selectedFile) {
        const contentType = getImageContentType(selectedFile)
        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')
        uploadedPath = `home-hero/${crypto.randomUUID()}-${safeName}`
        const { error: uploadError } = await client.storage
          .from('wedding-assets')
          .upload(uploadedPath, selectedFile, { upsert: false, contentType })

        if (uploadError) throw uploadError
        const { data } = client.storage.from('wedding-assets').getPublicUrl(uploadedPath)
        nextSettings.imageUrl = data.publicUrl
        nextSettings.imagePath = uploadedPath
      }

      if (removeCurrentImage) {
        nextSettings.imageUrl = ''
        nextSettings.imagePath = ''
      }
      nextSettings.overlay = true
      if (nextSettings.backgroundType === 'image' && !nextSettings.imageUrl) {
        throw new Error('Envie uma foto antes de escolher o fundo com imagem.')
      }

      const { error: saveError } = await client
        .from('wedding_settings')
        .upsert({
          key: 'home_hero',
          value: nextSettings,
          is_public: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })

      if (saveError) throw saveError

      setSettings(nextSettings)
      updateHomeHero(nextSettings)
      setSelectedFile(null)
      setRemoveCurrentImage(false)
      setPendingRemovalPath('')
      if (fileInput.current) fileInput.current.value = ''

      const oldImagePath = uploadedPath || removeCurrentImage ? previousImagePath : ''
      if (oldImagePath && oldImagePath !== nextSettings.imagePath) {
        const { error: removeError } = await client.storage.from('wedding-assets').remove([oldImagePath])
        if (removeError) {
          setNotice(`Configuração salva, mas não foi possível excluir a foto anterior: ${removeError.message}`)
          return
        }
      }

      setNotice('Configuração da primeira seção salva.')
    } catch (saveError) {
      if (uploadedPath && client) {
        const { error: cleanupError } = await client.storage.from('wedding-assets').remove([uploadedPath])
        if (cleanupError) {
          setError(`${saveError.message} Também não foi possível remover o upload temporário: ${cleanupError.message}`)
          return
        }
      }
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  const previewImage = filePreview || (removeCurrentImage ? '' : settings.imageUrl)
  const previewSettings = {
    ...settings,
    imageUrl: previewImage,
    backgroundType: settings.backgroundType,
  }

  if (loading) return <p className="admin-loading">Carregando configuração da Home…</p>

  return <section className="admin-resource home-hero-settings">
    <div className="admin-resource-heading">
      <div><span className="eyebrow">Área dos noivos</span><h1>Fundo da primeira seção</h1></div>
    </div>
    <p className="admin-page-intro">Escolha uma cor ou uma foto para o fundo do convite na página inicial. A configuração padrão é o verde oliva.</p>
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <form className="admin-edit-form" onSubmit={saveSettings}>
      <div className="admin-form-grid">
        <label>
          Tipo de fundo
          <select name="backgroundType" value={settings.backgroundType} onChange={updateSetting}>
            <option value="color">Fundo verde / cor</option>
            <option value="image">Fundo com foto</option>
          </select>
        </label>
        {settings.backgroundType === 'color' && <label>
          Cor do fundo
          <span className="home-hero-color-field">
            <input name="backgroundColor" type="color" value={settings.backgroundColor} onChange={updateSetting} />
            <span>{settings.backgroundColor.toUpperCase()}</span>
          </span>
        </label>}
        <label className="admin-field-wide">
          Foto do fundo (JPG, JPEG, PNG ou WEBP; até 10 MB)
          <input ref={fileInput} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={selectFile} />
        </label>
        {settings.backgroundType === 'image' && <>
          <label>
            Enquadramento da foto
            <select name="imageSize" value={settings.imageSize} onChange={updateSetting}>
              <option value="cover">Preencher toda a área</option>
              <option value="contain">Exibir a foto inteira</option>
            </select>
          </label>
        </>}
      </div>
      {previewImage && <div className="admin-file-preview">
        <img src={previewImage} alt="Foto escolhida para o fundo da primeira seção" />
        {!selectedFile && <button className="button button-muted" type="button" onClick={discardSavedImage}>Remover foto salva</button>}
      </div>}
      <div className="home-hero-preview-block">
        <h2>Prévia da primeira seção</h2>
        <div className="hero-info home-hero-preview" style={getHomeHeroBackgroundStyle(previewSettings, selectedFile ? filePreview : '')}>
          <div className="hero-damask" aria-hidden="true" />
          <div className="hero-foliage" aria-hidden="true" />
          <div className="container hero-content">
            <span className="eyebrow">Uma nova história começa aqui</span>
            <h1>{publicWeddingData.couple}</h1>
            <p className="hero-subtitle">Nosso grande dia</p>
            <div className="hero-details">
              <strong>{publicWeddingData.dateLabel}</strong><span>{publicWeddingData.timeLabel}</span><span className="hero-divider" />
              <span>{publicWeddingData.venue}</span><span>{publicWeddingData.city}</span>
            </div>
            <Countdown date={publicWeddingData.date} />
          </div>
        </div>
      </div>
      <div className="admin-form-actions">
        <button className="button" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar configuração'}</button>
        <button className="button button-muted" type="button" disabled={saving} onClick={() => {
          setSettings({ ...defaultHomeHero })
          setSelectedFile(null)
          setPendingRemovalPath(settings.imagePath)
          setRemoveCurrentImage(Boolean(settings.imagePath))
          if (fileInput.current) fileInput.current.value = ''
          setError('')
          setNotice('')
        }}>Restaurar padrão verde</button>
      </div>
    </form>
  </section>
}

export default HomeHeroSettings
