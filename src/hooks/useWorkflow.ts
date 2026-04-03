import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkflowStore } from '../store/workflowStore'
import type { ShortcutChannel } from '../../shared/types'

export function useWorkflow(): void {
  const navigate = useNavigate()
  // Ref para acessar o estado mais recente dentro dos listeners sem re-registrá-los
  const storeRef = useRef(useWorkflowStore.getState())

  useEffect(() => {
    // Atualiza a ref sempre que o store mudar
    return useWorkflowStore.subscribe((state) => {
      storeRef.current = state
    })
  }, [])

  useEffect(() => {
    let busy = false // Guard para evitar acionamento duplo enquanto dialog está aberto

    async function handleF1(): Promise<void> {
      if (busy) return
      busy = true
      try {
        const { currentImages, currentImageIndex } = storeRef.current
        const isLast = currentImageIndex >= currentImages.length - 1
        console.log(`[useWorkflow] F1: imagem ${currentImageIndex + 1}/${currentImages.length} isLast=${isLast}`)

        if (!isLast) {
          storeRef.current.setCurrentImageIndex(currentImageIndex + 1)
          return
        }

        // Era a última imagem
        const resposta = await window.electronAPI.showConfirm(
          'Você fechou todas as imagens deste REF sem selecionar nenhum ponto.\n\nDeseja ver as imagens novamente?',
          'Ver novamente'
        )
        console.log(`[useWorkflow] F1 (última imagem): resposta="${resposta ? 'Ver novamente' : 'Cancelar'}"`)

        if (resposta) {
          await window.electronAPI.restartRef()
          storeRef.current.setCurrentImageIndex(0)
        } else {
          const snapshot = await window.electronAPI.nextRef()
          console.log(`[useWorkflow] F1 → nextRef: refIndex=${snapshot.currentRefIndex} finished=${snapshot.isFinished}`)
          if (snapshot.isFinished) {
            navigate('/', { state: { finished: true, total: snapshot.allRefs.length } })
          } else {
            storeRef.current.setFromSnapshot(snapshot)
          }
        }
      } finally {
        busy = false
      }
    }

    async function handleF2(): Promise<void> {
      if (busy) return
      busy = true
      try {
        const { currentImages, currentImageIndex } = storeRef.current
        const currentImage = currentImages[currentImageIndex]
        if (!currentImage) { console.warn('[useWorkflow] F2: nenhuma imagem atual'); return }

        console.log(`[useWorkflow] F2: ID="${currentImage.id}" imagem ${currentImageIndex + 1}/${currentImages.length}`)

        // Dialog primeiro (aparece imediatamente)
        const continuar = await window.electronAPI.showConfirm(
          `ID "${currentImage.id}" — confirmar seleção?\n\nDeseja procurar outro ponto neste mesmo REF?`,
          'Procurar outro'
        )
        console.log(`[useWorkflow] F2: resposta="${continuar ? 'Procurar outro' : 'Cancelar'}"`)

        // Grava no Excel (IPC retorna imediatamente, write acontece em background)
        await window.electronAPI.writeResult()
        console.log('[useWorkflow] F2: writeResult concluído (write async enfileirado)')

        if (continuar) {
          const next = currentImageIndex + 1
          storeRef.current.setCurrentImageIndex(next < currentImages.length ? next : 0)
        } else {
          const snapshot = await window.electronAPI.nextRef()
          console.log(`[useWorkflow] F2 → nextRef: refIndex=${snapshot.currentRefIndex} finished=${snapshot.isFinished}`)
          if (snapshot.isFinished) {
            navigate('/', { state: { finished: true, total: snapshot.allRefs.length } })
          } else {
            storeRef.current.setFromSnapshot(snapshot)
          }
        }
      } finally {
        busy = false
      }
    }

    async function handleF3(): Promise<void> {
      if (busy) return
      busy = true
      try {
        console.log('[useWorkflow] F3: solicitando encerramento')
        const confirmar = await window.electronAPI.showConfirm(
          'Deseja encerrar a revisão?',
          'Encerrar'
        )
        console.log(`[useWorkflow] F3: resposta="${confirmar ? 'Encerrar' : 'Cancelar'}"`)
        if (!confirmar) return

        await window.electronAPI.endWorkflow()
        storeRef.current.reset()
        navigate('/')
      } finally {
        busy = false
      }
    }

    // Registra listeners e guarda as referências retornadas pelo preload
    const channels: ShortcutChannel[] = ['shortcut:f1', 'shortcut:f2', 'shortcut:f3']
    const handlers = [handleF1, handleF2, handleF3]
    const listeners = channels.map((ch, i) => window.electronAPI.onShortcut(ch, handlers[i]))

    return () => {
      // Remove exatamente os listeners registrados neste efeito
      channels.forEach((ch, i) => window.electronAPI.offShortcut(ch, listeners[i]))
    }
  }, [navigate]) // navigate é estável, efeito roda apenas uma vez
}
