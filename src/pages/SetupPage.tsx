import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useConfigStore } from '../store/configStore'
import { useWorkflowStore } from '../store/workflowStore'

// Spinner inline simples
function Spinner(): JSX.Element {
  return (
    <span style={{
      display: 'inline-block',
      width: 14, height: 14,
      border: '2px solid var(--border)',
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      verticalAlign: 'middle',
      marginRight: 6
    }} />
  )
}

// Overlay de loading para cards
function LoadingOverlay({ message }: { message: string }): JSX.Element {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(15,15,15,0.75)',
      borderRadius: 'var(--radius)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10, gap: 8, fontSize: 13, color: 'var(--text-muted)'
    }}>
      <Spinner />{message}
    </div>
  )
}

export default function SetupPage(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const finishedState = location.state as { finished?: boolean; total?: number } | null

  const {
    filePath, sheetNames, config,
    setFilePath, updateBaseSheet, updateListSheet, setCondicaoValue
  } = useConfigStore()

  const setInitial = useWorkflowStore((s) => s.setInitial)

  const [baseColumns, setBaseColumns] = useState<string[]>([])
  const [listColumns, setListColumns] = useState<string[]>([])

  const [loadingFile, setLoadingFile] = useState(false)
  const [loadingBaseCol, setLoadingBaseCol] = useState(false)
  const [loadingListCol, setLoadingListCol] = useState(false)
  const [loadingStart, setLoadingStart] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Carregar colunas quando a aba base mudar
  useEffect(() => {
    if (!filePath || !config.baseSheet.name) return
    console.log(`[SetupPage] carregando colunas da aba base: "${config.baseSheet.name}"`)
    setLoadingBaseCol(true)
    setBaseColumns([])
    window.electronAPI.readColumns(filePath, config.baseSheet.name)
      .then(({ columns }) => {
        console.log(`[SetupPage] aba base: ${columns.length} colunas`)
        setBaseColumns(columns)
      })
      .finally(() => setLoadingBaseCol(false))
  }, [filePath, config.baseSheet.name])

  // Carregar colunas quando a aba lista mudar
  useEffect(() => {
    if (!filePath || !config.listSheet.name) return
    console.log(`[SetupPage] carregando colunas da aba lista: "${config.listSheet.name}"`)
    setLoadingListCol(true)
    setListColumns([])
    window.electronAPI.readColumns(filePath, config.listSheet.name)
      .then(({ columns }) => {
        console.log(`[SetupPage] aba lista: ${columns.length} colunas`)
        setListColumns(columns)
      })
      .finally(() => setLoadingListCol(false))
  }, [filePath, config.listSheet.name])

  async function handleSelectFile(): Promise<void> {
    console.log('[SetupPage] selecionando arquivo...')
    setLoadingFile(true)
    const result = await window.electronAPI.selectFile()
    setLoadingFile(false)
    if (!result) { console.log('[SetupPage] seleção de arquivo cancelada'); return }
    console.log(`[SetupPage] arquivo selecionado: ${result.filePath}`)
    setFilePath(result.filePath, result.sheetNames)
    setBaseColumns([])
    setListColumns([])
  }

  async function handleStart(): Promise<void> {
    const { baseSheet, listSheet, condicaoValue } = config
    if (!filePath) return setError('Selecione um arquivo Excel.')
    if (!baseSheet.name) return setError('Selecione a aba BASE.')
    if (!listSheet.name) return setError('Selecione a aba LISTAGEM.')
    if (!baseSheet.colId || !baseSheet.colRef || !baseSheet.colFoto || !baseSheet.colCondicao)
      return setError('Mapeie todas as colunas da aba BASE.')
    if (!listSheet.colRef) return setError('Mapeie a coluna REF da aba LISTAGEM.')
    if (!condicaoValue.trim()) return setError('Defina o valor a gravar na coluna CONDICAO.')

    console.log('[SetupPage] iniciando workflow...')
    setError(null)
    setLoadingStart(true)
    try {
      const result = await window.electronAPI.startWorkflow(config)
      if (result.allRefs.length === 0) {
        setError('Nenhum REF encontrado na aba LISTAGEM.')
        return
      }
      console.log(`[SetupPage] workflow iniciado: ${result.allRefs.length} REFs`)
      setInitial(result.allRefs, result.currentImages)
      navigate('/review')
    } catch (e) {
      console.error('[SetupPage] erro ao iniciar workflow:', e)
      setError(`Erro ao iniciar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoadingStart(false)
    }
  }

  const sheetOptions = sheetNames.map((s) => <option key={s} value={s}>{s}</option>)
  const baseColOptions = baseColumns.map((c) => <option key={c} value={c}>{c}</option>)
  const listColOptions = listColumns.map((c) => <option key={c} value={c}>{c}</option>)
  const empty = <option value="">-- selecione --</option>
  const loadingOption = <option value="">Carregando colunas...</option>

  const anyLoading = loadingFile || loadingStart

  return (
    <>
      {/* Keyframes para o spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ marginBottom: 4 }}>Links Imagem</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 28 }}>
          Configure a planilha e inicie a revisão de imagens
        </p>

        {finishedState?.finished && (
          <div style={{
            background: '#1a3a1a', border: '1px solid #4caf50',
            borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 24,
            color: '#4caf50', fontSize: 13
          }}>
            Revisão concluída! Todos os {finishedState.total} REFs foram processados.
          </div>
        )}

        {/* Seleção de arquivo */}
        <div className="card" style={{ marginBottom: 16, position: 'relative' }}>
          <h3 style={{ marginBottom: 14 }}>Arquivo Excel</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="secondary"
              onClick={handleSelectFile}
              disabled={anyLoading || loadingFile}
            >
              {loadingFile ? <><Spinner />Lendo arquivo...</> : 'Selecionar arquivo...'}
            </button>
            <span style={{ color: filePath ? 'var(--text)' : 'var(--text-muted)', fontSize: 13, wordBreak: 'break-all' }}>
              {filePath || 'Nenhum arquivo selecionado'}
            </span>
          </div>
        </div>

        {/* Seleção de abas */}
        {sheetNames.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 14 }}>Abas da planilha</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="field">
                <label>Aba BASE (dados completos)</label>
                <select
                  value={config.baseSheet.name}
                  onChange={(e) => updateBaseSheet('name', e.target.value)}
                  disabled={anyLoading}
                >
                  {empty}{sheetOptions}
                </select>
              </div>
              <div className="field">
                <label>Aba LISTAGEM (REFs a processar)</label>
                <select
                  value={config.listSheet.name}
                  onChange={(e) => updateListSheet('name', e.target.value)}
                  disabled={anyLoading}
                >
                  {empty}{sheetOptions}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Mapeamento de colunas da BASE */}
        {(baseColumns.length > 0 || loadingBaseCol) && (
          <div className="card" style={{ marginBottom: 16, position: 'relative' }}>
            {loadingBaseCol && <LoadingOverlay message="Lendo colunas da aba..." />}
            <h3 style={{ marginBottom: 14 }}>Colunas da aba BASE</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { key: 'colId', label: 'Coluna ID (identificador único)' },
                { key: 'colRef', label: 'Coluna REF (grupo / TRAFO)' },
                { key: 'colFoto', label: 'Coluna FOTO (URL da imagem)' },
                { key: 'colCondicao', label: 'Coluna CONDICAO (onde gravar)' }
              ].map(({ key, label }) => (
                <div key={key} className="field">
                  <label>{label}</label>
                  <select
                    value={config.baseSheet[key as keyof typeof config.baseSheet]}
                    onChange={(e) => updateBaseSheet(key as keyof typeof config.baseSheet, e.target.value)}
                    disabled={loadingBaseCol || anyLoading}
                  >
                    {loadingBaseCol ? loadingOption : <>{empty}{baseColOptions}</>}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mapeamento de colunas da LISTAGEM */}
        {(listColumns.length > 0 || loadingListCol) && (
          <div className="card" style={{ marginBottom: 16, position: 'relative' }}>
            {loadingListCol && <LoadingOverlay message="Lendo colunas da aba..." />}
            <h3 style={{ marginBottom: 14 }}>Coluna da aba LISTAGEM</h3>
            <div className="field" style={{ maxWidth: 300 }}>
              <label>Coluna com os REFs únicos</label>
              <select
                value={config.listSheet.colRef}
                onChange={(e) => updateListSheet('colRef', e.target.value)}
                disabled={loadingListCol || anyLoading}
              >
                {loadingListCol ? loadingOption : <>{empty}{listColOptions}</>}
              </select>
            </div>
          </div>
        )}

        {/* Valor da condição */}
        {filePath && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 14 }}>Valor da condição</h3>
            <div className="field" style={{ maxWidth: 300 }}>
              <label>Texto a gravar na coluna CONDICAO ao selecionar um ponto</label>
              <input
                type="text"
                value={config.condicaoValue}
                onChange={(e) => setCondicaoValue(e.target.value)}
                placeholder="Ex: OK, SIM, X, ✓"
                disabled={anyLoading}
              />
            </div>
          </div>
        )}

        {error && (
          <div style={{
            background: '#2a1a1a', border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16,
            color: 'var(--danger)', fontSize: 13
          }}>
            {error}
          </div>
        )}

        <button
          className="primary"
          onClick={handleStart}
          disabled={anyLoading || !filePath}
          style={{ fontSize: 15, padding: '10px 28px' }}
        >
          {loadingStart ? <><Spinner />Carregando...</> : 'Iniciar revisão →'}
        </button>
      </div>
    </>
  )
}
