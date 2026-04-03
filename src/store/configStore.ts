import { create } from 'zustand'
import type { AppConfig } from '../../shared/types'

interface ConfigState {
  filePath: string
  sheetNames: string[]
  config: AppConfig
  setFilePath: (filePath: string, sheetNames: string[]) => void
  updateBaseSheet: (field: keyof AppConfig['baseSheet'], value: string) => void
  updateListSheet: (field: keyof AppConfig['listSheet'], value: string) => void
  setCondicaoValue: (value: string) => void
}

const defaultConfig: AppConfig = {
  filePath: '',
  baseSheet: { name: '', colId: '', colRef: '', colFoto: '', colCondicao: '' },
  listSheet: { name: '', colRef: '' },
  condicaoValue: 'OK'
}

export const useConfigStore = create<ConfigState>((set) => ({
  filePath: '',
  sheetNames: [],
  config: defaultConfig,

  setFilePath: (filePath, sheetNames) =>
    set((s) => ({
      filePath,
      sheetNames,
      config: { ...s.config, filePath }
    })),

  updateBaseSheet: (field, value) =>
    set((s) => ({
      config: {
        ...s.config,
        baseSheet: { ...s.config.baseSheet, [field]: value }
      }
    })),

  updateListSheet: (field, value) =>
    set((s) => ({
      config: {
        ...s.config,
        listSheet: { ...s.config.listSheet, [field]: value }
      }
    })),

  setCondicaoValue: (value) =>
    set((s) => ({ config: { ...s.config, condicaoValue: value } }))
}))
