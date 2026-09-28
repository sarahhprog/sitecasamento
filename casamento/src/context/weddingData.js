import { createContext, useContext } from 'react'
import { weddingData } from '../data/weddingData'

export const WeddingDataContext = createContext({ data: weddingData, error: '' })

export function useWeddingData() {
  return useContext(WeddingDataContext)
}
