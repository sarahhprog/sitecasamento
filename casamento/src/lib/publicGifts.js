export const PAGE_SIZE = 12

export async function fetchPublicGifts(supabase, page, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const { data, count, error } = await supabase
      .from('gifts')
      .select(
        'id,name,description,value,category,image_url,file_url,file_type,available,public_visible,created_at',
        { count: 'exact' }
      )
      .eq('public_visible', true)
      .order('created_at', { ascending: true })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
      .abortSignal(controller.signal)

    if (error) throw error
    if (!Array.isArray(data) || typeof count !== 'number') {
      throw new Error('O Supabase retornou uma resposta inválida para a lista de presentes.')
    }

    return { gifts: data, count }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('A consulta dos presentes excedeu o tempo limite.', { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
