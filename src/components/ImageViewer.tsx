import { useState, useEffect } from 'react'

// URLs que terminam em extensão de imagem são exibidas como <img>
// URLs de páginas HTML (ex: .php, sem extensão de imagem) são exibidas como <iframe>
function isDirectImage(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff?)(\?.*)?$/i.test(url)
}

interface ImageViewerProps {
  url: string
}

export default function ImageViewer({ url }: ImageViewerProps): JSX.Element {
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [iframeKey, setIframeKey] = useState(0)

  const directImage = isDirectImage(url)

  useEffect(() => {
    setImgStatus('loading')
    // Força recriação do iframe quando a URL muda (reseta scroll e estado interno)
    setIframeKey((k) => k + 1)
  }, [url])

  const containerStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#111',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    position: 'relative',
    minHeight: 0
  }

  if (!directImage) {
    // Galeria HTML: exibe em iframe para preservar a navegação interna do site
    return (
      <div style={containerStyle}>
        <iframe
          key={iframeKey}
          src={url}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block'
          }}
          title="Galeria de fotos do ponto"
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>
    )
  }

  // Imagem direta
  return (
    <div style={containerStyle}>
      {imgStatus === 'loading' && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando imagem...</div>
      )}
      {imgStatus === 'error' && (
        <div style={{ color: 'var(--danger)', fontSize: 13, textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          Falha ao carregar imagem
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, wordBreak: 'break-all', maxWidth: 400 }}>
            {url}
          </div>
        </div>
      )}
      <img
        src={url}
        alt="Foto do ponto"
        onLoad={() => setImgStatus('loaded')}
        onError={() => setImgStatus('error')}
        style={{
          display: imgStatus === 'loaded' ? 'block' : 'none',
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain'
        }}
      />
    </div>
  )
}
