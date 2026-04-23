import { create } from 'zustand'
import type { BaseRow } from '../../shared/types'

interface WorkflowState {
  allRefs: string[]
  currentRefIndex: number
  currentImages: BaseRow[]
  currentImageIndex: number
  isFinished: boolean

  setInitial: (allRefs: string[], currentImages: BaseRow[]) => void
  setCurrentImageIndex: (index: number) => void
  setCurrentImageCondicao: (condicao: string | null) => void
  setFromSnapshot: (snapshot: {
    allRefs: string[]
    currentRefIndex: number
    currentImages: BaseRow[]
    currentImageIndex: number
    isFinished: boolean
  }) => void
  reset: () => void
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  allRefs: [],
  currentRefIndex: 0,
  currentImages: [],
  currentImageIndex: 0,
  isFinished: false,

  setInitial: (allRefs, currentImages) =>
    set({ allRefs, currentRefIndex: 0, currentImages, currentImageIndex: 0, isFinished: false }),

  setCurrentImageIndex: (index) => set({ currentImageIndex: index }),

  setCurrentImageCondicao: (condicao) =>
    set((s) => ({
      currentImages: s.currentImages.map((img, i) =>
        i === s.currentImageIndex ? { ...img, condicao } : img
      )
    })),

  setFromSnapshot: (snapshot) => set(snapshot),

  reset: () =>
    set({ allRefs: [], currentRefIndex: 0, currentImages: [], currentImageIndex: 0, isFinished: false })
}))
