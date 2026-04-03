import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkflowStore } from '../store/workflowStore'
import { useWorkflow } from '../hooks/useWorkflow'
import ImageViewer from '../components/ImageViewer'
import HotkeyLegend from '../components/HotkeyLegend'

export default function ReviewPage(): JSX.Element {
  const navigate = useNavigate()
  const { allRefs, currentRefIndex, currentImages, currentImageIndex } = useWorkflowStore()

  // Redireciona para setup se o workflow não foi iniciado
  useEffect(() => {
    if (allRefs.length === 0) {
      navigate('/')
    }
  }, [allRefs, navigate])

  // Registra handlers dos hotkeys F1/F2/F3
  useWorkflow()

  const currentRef = allRefs[currentRefIndex] ?? ''
  const currentImage = currentImages[currentImageIndex]
  const totalRefs = allRefs.length
  const totalImages = currentImages.length

  if (!currentImage) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ color: 'var(--text-muted)' }}>Carregando...</div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden'
    }}>
      {/* Header com informações do REF e da imagem */}
      <div style={{
        padding: '12px 20px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        flexShrink: 0
      }}>
        {/* Progresso de REFs */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>REF</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent)' }}>{currentRef}</div>
        </div>

        <div style={{ width: 1, height: 36, background: 'var(--border)' }} />

        {/* Progresso numérico REF */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Referência</div>
          <div style={{ fontWeight: 600 }}>
            {currentRefIndex + 1} <span style={{ color: 'var(--text-muted)' }}>de</span> {totalRefs}
          </div>
        </div>

        <div style={{ width: 1, height: 36, background: 'var(--border)' }} />

        {/* Progresso de imagens */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Imagem</div>
          <div style={{ fontWeight: 600 }}>
            {currentImageIndex + 1} <span style={{ color: 'var(--text-muted)' }}>de</span> {totalImages}
          </div>
        </div>

        <div style={{ width: 1, height: 36, background: 'var(--border)' }} />

        {/* ID do ponto atual */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID do ponto</div>
          <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'monospace' }}>{currentImage.id}</div>
        </div>

        {/* Barra de progresso total */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            Progresso geral
          </div>
          <div style={{
            height: 6,
            background: 'var(--border)',
            borderRadius: 3,
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${((currentRefIndex) / totalRefs) * 100}%`,
              background: 'var(--accent)',
              borderRadius: 3,
              transition: 'width 0.3s'
            }} />
          </div>
        </div>
      </div>

      {/* Área da imagem */}
      <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <ImageViewer url={currentImage.fotoUrl} />
      </div>

      {/* Legenda dos hotkeys */}
      <HotkeyLegend />
    </div>
  )
}
