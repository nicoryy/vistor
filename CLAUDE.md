# Links Imagem — Contexto do Projeto

## O Problema

O usuário revisa planilhas Excel com dados de infraestrutura (ex: iluminação pública). O fluxo manual é lento:

1. Pegar um REF (ex: código de TRAFO)
2. Filtrar a base por esse REF → vários pontos com fotos
3. Abrir cada foto no navegador para identificar o ponto correto
4. Voltar à planilha e preencher a coluna CONDICAO no ponto identificado
5. Repetir para o próximo REF

## A Solução

App desktop (Electron) que automatiza o filtro e a abertura das fotos, usando hotkeys para preencher a planilha sem sair do visualizador.

## Stack

- **Electron** (desktop Windows) + **electron-vite** (build)
- **React + TypeScript** (UI)
- **SheetJS (xlsx)** (leitura/escrita de .xlsx)
- **Zustand** (estado global no renderer)
- **react-router-dom** (navegação SetupPage ↔ ReviewPage)

## Estrutura de Diretórios

```
links_imagem/
├── index.html                    # Entrada HTML (raiz, padrão electron-vite)
├── electron.vite.config.ts       # Config de build (main + preload + renderer)
├── package.json
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
│
├── electron/
│   ├── main/
│   │   ├── index.ts              # Entry do main process, cria BrowserWindow
│   │   ├── appState.ts           # Singleton: estado do workflow (allRefs, imagens, etc)
│   │   ├── shortcutManager.ts    # Registra F1/F2/F3 via globalShortcut
│   │   └── ipcHandlers.ts        # Todos os ipcMain.handle() centralizados
│   └── preload/
│       └── index.ts              # contextBridge → expõe window.electronAPI
│
├── shared/
│   ├── types.ts                  # Tipos TypeScript compartilhados (main + renderer)
│   └── excel/
│       └── excelService.ts       # SheetJS: loadWorkbook, readBase, readList, writeCondicao
│
└── src/                          # Renderer (React)
    ├── main.tsx                  # ReactDOM.createRoot
    ├── App.tsx                   # Router: / → SetupPage, /review → ReviewPage
    ├── index.css                 # Tema escuro global
    ├── pages/
    │   ├── SetupPage.tsx         # Config: arquivo .xlsx, abas, colunas, valor da condição
    │   └── ReviewPage.tsx        # Slideshow de imagens com barra de status
    ├── components/
    │   ├── ImageViewer.tsx        # <img> com estados loading/loaded/error
    │   └── HotkeyLegend.tsx      # Legenda fixa F1/F2/F3 no rodapé
    ├── store/
    │   ├── configStore.ts         # Zustand: configuração (filePath, abas, colunas)
    │   └── workflowStore.ts       # Zustand: estado em execução (REF atual, imagem atual)
    └── hooks/
        └── useWorkflow.ts         # Lógica dos hotkeys: F1, F2, F3
```

## Fluxo da Aplicação

### Setup (SetupPage)
1. Usuário seleciona o `.xlsx`
2. Escolhe qual aba é a BASE e qual é a LISTAGEM
3. Mapeia as colunas da BASE: ID, REF, FOTO, CONDICAO
4. Mapeia a coluna REF da LISTAGEM
5. Define o valor a gravar na CONDICAO (ex: "OK")
6. Clica "Iniciar revisão"

### Revisão (ReviewPage)
- Para cada REF da LISTAGEM, exibe as imagens da BASE uma a uma (slideshow)
- **F1**: próxima imagem; se última → dialog "Ver novamente?" (Sim=reinicia, Não=próximo REF sem gravar)
- **F2**: seleciona o ponto atual → grava CONDICAO no Excel → dialog "Procurar outro?" (Sim=continua, Não=próximo REF)
- **F3**: encerra revisão → volta ao Setup

## Canais IPC

| Canal | Direção | Descrição |
|-------|---------|-----------|
| `dialog:select-file` | renderer→main | Abre dialog de arquivo, retorna `{ filePath, sheetNames }` |
| `excel:read-columns` | renderer→main | Retorna `{ columns, preview }` de uma aba |
| `workflow:start` | renderer→main | Inicializa AppState com a config, registra shortcuts |
| `workflow:write-result` | renderer→main | Grava CONDICAO na linha atual do Excel |
| `workflow:next-ref` | renderer→main | Avança para o próximo REF, retorna snapshot |
| `workflow:restart-ref` | renderer→main | Reinicia imagens do REF atual |
| `workflow:end` | renderer→main | Desregistra shortcuts, reseta AppState |
| `shortcut:f1/f2/f3` | main→renderer | Emitido pelo shortcutManager ao pressionar F1/F2/F3 |

## API do Renderer (`window.electronAPI`)

Definida em `electron/preload/index.ts` via `contextBridge`.
Tipos completos em `shared/types.ts` (interface `ElectronAPI`).

## Convenções

- O **main process é a fonte de verdade** do workflow (AppState singleton)
- O renderer sincroniza via IPC e mantém um espelho no Zustand
- Toda lógica de Excel fica em `shared/excel/excelService.ts` (importado só pelo main)
- Hotkeys só são registrados após `workflow:start` e desregistrados em `workflow:end`
- A escrita no Excel é **imediata** ao pressionar F2 (sem buffer), para evitar perda de dados

## Comandos

```bash
npm run dev      # Inicia em modo desenvolvimento (hot reload)
npm run build    # Build de produção
npm run dist     # Build + gera instalador .exe (electron-builder)
npm run typecheck # Verifica tipos TypeScript sem compilar
```

## Planilha de Teste

Para testar, criar um `.xlsx` com:
- **Aba Base**: colunas `ID | REF | FOTO | CONDICAO` (FOTO = URL pública de imagem)
- **Aba Lista**: coluna `REF` com valores únicos presentes na aba Base
