import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkflowStore } from '../store/workflowStore'
import { useConfigStore } from '../store/configStore'
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

        const jaTemCondicao = !!currentImage.condicao
        console.log(`[useWorkflow] F2: ID="${currentImage.id}" condicao="${currentImage.condicao ?? ''}" jaTemCondicao=${jaTemCondicao}`)

        if (jaTemCondicao) {
          // Toggle: remove a condição já existente
          const remover = await window.electronAPI.showConfirm(
            `ID "${currentImage.id}" já tem condição "${currentImage.condicao}".\n\nDeseja remover a condição deste ponto?`,
            'Remover'
          )
          if (!remover) return
          await window.electronAPI.clearResult()
          storeRef.current.setCurrentImageCondicao(null)
          console.log('[useWorkflow] F2: condição removida')
          return
        }

        // Fluxo normal: selecionar este ponto
        const condicaoValue = useConfigStore.getState().config.condicaoValue
        const continuar = await window.electronAPI.showConfirm(
          `ID "${currentImage.id}" — confirmar seleção?\n\nDeseja procurar outro ponto neste mesmo REF?`,
          'Procurar outro'
        )
        console.log(`[useWorkflow] F2: resposta="${continuar ? 'Procurar outro' : 'Cancelar'}"`)

        await window.electronAPI.writeResult()
        storeRef.current.setCurrentImageCondicao(condicaoValue)

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

    async function handleF4(): Promise<void> {
      if (busy) return
      busy = true
      try {
        const { currentRefIndex } = storeRef.current
        if (currentRefIndex === 0) {
          console.log('[useWorkflow] F4: já está no primeiro REF')
          return
        }
        const snapshot = await window.electronAPI.prevRef()
        console.log(`[useWorkflow] F4 → prevRef: refIndex=${snapshot.currentRefIndex}`)
        storeRef.current.setFromSnapshot(snapshot)
      } finally {
        busy = false
      }
    }

    // Registra listeners e guarda as referências retornadas pelo preload
    const channels: ShortcutChannel[] = ['shortcut:f1', 'shortcut:f2', 'shortcut:f3', 'shortcut:f4']
    const handlers = [handleF1, handleF2, handleF3, handleF4]
    const listeners = channels.map((ch, i) => window.electronAPI.onShortcut(ch, handlers[i]))

    return () => {
      // Remove exatamente os listeners registrados neste efeito
      channels.forEach((ch, i) => window.electronAPI.offShortcut(ch, listeners[i]))
    }
  }, [navigate]) // navigate é estável, efeito roda apenas uma vez
}
