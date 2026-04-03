const KEYS = [
  { key: 'F1', label: 'Fechar / Próxima imagem', color: '#ff9800' },
  { key: 'F2', label: 'Selecionar este ponto', color: '#4caf50' },
  { key: 'F3', label: 'Encerrar revisão', color: '#f44336' }
]

export default function HotkeyLegend(): JSX.Element {
  return (
    <div style={{
      display: 'flex',
      gap: 16,
      padding: '10px 16px',
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)'
    }}>
      {KEYS.map(({ key, label, color }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            background: color,
            color: '#fff',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'monospace'
          }}>{key}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</span>
        </div>
      ))}
    </div>
  )
}
