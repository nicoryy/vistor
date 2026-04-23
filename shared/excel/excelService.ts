import * as XLSX from 'xlsx'
import { writeFile } from 'fs/promises'
import type { AppConfig, BaseRow } from '../types'

// Encontra o índice de uma coluna pelo nome do cabeçalho (case-insensitive)
function colNameToIndex(headers: string[], colName: string): number {
  return headers.findIndex(
    (h) => h.toLowerCase().trim() === colName.toLowerCase().trim()
  )
}

export function loadWorkbook(filePath: string): XLSX.WorkBook {
  console.log(`[ExcelService] loadWorkbook: ${filePath}`)
  const t0 = Date.now()
  const wb = XLSX.readFile(filePath, { cellStyles: false, cellNF: false })
  console.log(`[ExcelService] loadWorkbook concluído em ${Date.now() - t0}ms (abas: ${wb.SheetNames.join(', ')})`)
  return wb
}

export function getSheetNames(wb: XLSX.WorkBook): string[] {
  return wb.SheetNames
}

// Retorna os nomes das colunas (cabeçalho) de uma aba
export function getSheetHeaders(wb: XLSX.WorkBook, sheetName: string): string[] {
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  if (data.length === 0) return []
  return (data[0] as unknown[]).map((h) => String(h ?? ''))
}

export function getColumnsAndPreview(
  wb: XLSX.WorkBook,
  sheetName: string
): { columns: string[]; preview: Record<string, string>[] } {
  console.log(`[ExcelService] getColumnsAndPreview: aba "${sheetName}"`)
  const ws = wb.Sheets[sheetName]
  if (!ws) return { columns: [], preview: [] }

  // Limita a leitura ao cabeçalho + 3 linhas de preview (evita varrer planilhas inteiras)
  const fullRange = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  const previewRange = XLSX.utils.encode_range({
    s: fullRange.s,
    e: { r: Math.min(fullRange.e.r, 3), c: fullRange.e.c }
  })
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    range: previewRange
  }) as unknown[][]

  if (data.length === 0) return { columns: [], preview: [] }

  const headers = (data[0] as unknown[]).map((h) => String(h ?? ''))
  const preview = data.slice(1, 4).map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = String((row as unknown[])[i] ?? '')
    })
    return obj
  })

  console.log(`[ExcelService] getColumnsAndPreview: ${headers.length} colunas encontradas`)
  return { columns: headers, preview }
}

export function readBaseSheet(wb: XLSX.WorkBook, config: AppConfig): BaseRow[] {
  console.log(`[ExcelService] readBaseSheet: aba "${config.baseSheet.name}"`)
  const t0 = Date.now()
  const ws = wb.Sheets[config.baseSheet.name]
  if (!ws) { console.warn('[ExcelService] readBaseSheet: aba não encontrada'); return [] }

  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: ''
  }) as unknown[][]

  if (data.length < 2) { console.warn('[ExcelService] readBaseSheet: menos de 2 linhas'); return [] }

  const headers = (data[0] as unknown[]).map((h) => String(h ?? ''))

  const idCol = colNameToIndex(headers, config.baseSheet.colId)
  const refCol = colNameToIndex(headers, config.baseSheet.colRef)
  const fotoCol = colNameToIndex(headers, config.baseSheet.colFoto)
  const condicaoCol = colNameToIndex(headers, config.baseSheet.colCondicao)

  console.log(`[ExcelService] readBaseSheet: índices → id=${idCol} ref=${refCol} foto=${fotoCol} condicao=${condicaoCol}`)

  const rows: BaseRow[] = []
  data.slice(1).forEach((row, i) => {
    const r = row as unknown[]
    const id = String(r[idCol] ?? '').trim()
    const ref = String(r[refCol] ?? '').trim()
    const fotoUrl = String(r[fotoCol] ?? '').trim()
    const condicao = String(r[condicaoCol] ?? '').trim() || null

    if (id && ref && fotoUrl) {
      rows.push({ id, ref, fotoUrl, condicao, rowIndex: i + 1 })
    }
  })

  console.log(`[ExcelService] readBaseSheet: ${rows.length} linhas válidas em ${Date.now() - t0}ms`)
  return rows
}

export function readListSheet(wb: XLSX.WorkBook, config: AppConfig): string[] {
  console.log(`[ExcelService] readListSheet: aba "${config.listSheet.name}"`)
  const ws = wb.Sheets[config.listSheet.name]
  if (!ws) { console.warn('[ExcelService] readListSheet: aba não encontrada'); return [] }

  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: ''
  }) as unknown[][]

  if (data.length < 2) { console.warn('[ExcelService] readListSheet: menos de 2 linhas'); return [] }

  const headers = (data[0] as unknown[]).map((h) => String(h ?? ''))
  const refCol = colNameToIndex(headers, config.listSheet.colRef)

  console.log(`[ExcelService] readListSheet: coluna REF índice=${refCol}`)

  const refs: string[] = []
  data.slice(1).forEach((row) => {
    const ref = String((row as unknown[])[refCol] ?? '').trim()
    if (ref) refs.push(ref)
  })

  console.log(`[ExcelService] readListSheet: ${refs.length} REFs encontrados`)
  return refs
}

// Modifica a célula diretamente no workbook em memória (síncrono, ~1ms)
export function setCellValue(
  wb: XLSX.WorkBook,
  sheetName: string,
  rowIndex: number,
  colIndex: number,
  value: string
): void {
  const ws = wb.Sheets[sheetName]
  if (!ws || colIndex === -1) return

  const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })
  ws[cellAddress] = { v: value, t: 's' }

  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  if (rowIndex > range.e.r) {
    range.e.r = rowIndex
    ws['!ref'] = XLSX.utils.encode_range(range)
  }
}

// Serializa o workbook e escreve no disco de forma assíncrona
export async function writeWorkbookAsync(filePath: string, wb: XLSX.WorkBook): Promise<void> {
  console.log(`[ExcelService] writeWorkbookAsync: serializando...`)
  const t0 = Date.now()
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  console.log(`[ExcelService] writeWorkbookAsync: serializado em ${Date.now() - t0}ms, escrevendo no disco...`)
  await writeFile(filePath, buffer)
  console.log(`[ExcelService] writeWorkbookAsync: concluído em ${Date.now() - t0}ms total`)
}
