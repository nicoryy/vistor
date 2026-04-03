# Vistor

Sistema desktop para revisão de imagens vinculadas a planilhas Excel com automação via hotkeys. Desenvolvido para acelerar fluxos de inspeção de campo onde o operador precisa identificar um ponto específico dentre vários por referência de grupo.

## Problema resolvido

Dado um banco de dados com pontos de campo (ex: iluminação pública), cada ponto possui:
- Um **ID** único
- Um **REF** de grupo (ex: código de TRAFO)
- Um **link de foto**
- Uma **coluna de condição** a preencher

O fluxo manual era: filtrar REF na planilha → abrir fotos no navegador → localizar o ponto correto → voltar à planilha → preencher. O sistema automatiza todo esse ciclo.

## Como utilizar

### 1. Prepare a planilha

O Vistor trabalha com um arquivo Excel (`.xlsx`) que deve ter **duas abas**:

**Aba Base** — a tabela completa com todos os pontos de campo. Cada linha é um ponto e precisa ter ao menos estas informações em colunas separadas:
- Um **número ou código que identifica o ponto** (ex: coluna `ID`)
- Um **código de grupo**, que agrupa vários pontos sob uma mesma referência (ex: coluna `REF` ou `TRAFO`)
- Um **link para a foto** do ponto (ex: coluna `FOTO`)
- Uma **coluna vazia** onde o resultado será gravado (ex: coluna `CONDICAO`)

> Os nomes das colunas podem ser qualquer um — você escolhe quais são no app.

**Aba Lista** — uma tabela menor com os grupos que você quer revisar. Basta uma coluna com os códigos de grupo, um por linha.

Exemplo de como a planilha deve ficar:

**Aba Base** (ex: `Pontos`):
| ID | REF | FOTO | CONDICAO |
|----|-----|------|----------|
| 1001 | TBT0513 | https://... | |
| 1002 | TBT0513 | https://... | |
| 1003 | TBT0518 | https://... | |

**Aba Lista** (ex: `Trafos`):
| TRAFO |
|-------|
| TBT0513 |
| TBT0518 |

### 2. Abra e configure o app

1. Abra o Vistor
2. Clique em **Selecionar arquivo** e escolha o seu `.xlsx`
3. Indique qual aba é a **Base** (tabela completa) e qual é a **Lista** (grupos a revisar)
4. Indique quais colunas da aba Base correspondem a: ID, REF, FOTO e CONDICAO
5. Indique qual coluna da aba Lista contém os códigos de grupo
6. Digite o valor que será gravado quando você aprovar um ponto (ex: `OK`, `SIM`, `✓`)
7. Clique em **Iniciar revisão**

### 3. Faça a revisão

O app vai abrir as fotos de cada grupo automaticamente, uma a uma. Você não precisa usar o mouse — tudo é controlado pelo teclado:

| Tecla | O que faz |
|-------|-----------|
| **F1** | Passa para a próxima foto. Se for a última do grupo, pergunta se quer ver de novo ou pular para o próximo grupo |
| **F2** | Aprova o ponto atual — grava o valor que você configurou na coluna CONDICAO e pergunta se quer continuar procurando no mesmo grupo |
| **F3** | Encerra a revisão e volta à tela inicial |

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Electron 31 |
| Frontend | React 18 + TypeScript |
| Estado | Zustand |
| Roteamento | React Router DOM |
| Excel | SheetJS (xlsx) |
| Build | electron-vite + Vite 5 |
| Distribuição | electron-builder (NSIS para Windows) |

## Arquitetura

```
vistor/
├── electron/
│   ├── main/
│   │   ├── index.ts            # Entrada do processo principal, before-quit guard
│   │   ├── appState.ts         # Singleton de estado do workflow
│   │   ├── ipcHandlers.ts      # Canais IPC (setup, workflow, dialogs)
│   │   ├── shortcutManager.ts  # Hotkeys globais via globalShortcut
│   │   ├── writeWorker.ts      # Worker Thread: serialização e escrita do Excel
│   │   └── writeQueue.ts       # Gerenciador da fila de escritas assíncronas
│   └── preload/
│       └── index.ts            # contextBridge → window.electronAPI
├── shared/
│   ├── types.ts                # Tipos compartilhados (main + renderer)
│   └── excel/
│       └── excelService.ts     # Funções SheetJS (leitura, headers, colunas)
└── src/
    ├── pages/
    │   ├── SetupPage.tsx       # Configuração: arquivo, abas, colunas
    │   └── ReviewPage.tsx      # Visualizador slideshow + barra de progresso
    ├── components/
    │   ├── ImageViewer.tsx     # <img> para imagens diretas, <iframe> para galerias
    │   └── HotkeyLegend.tsx    # Legenda F1/F2/F3 fixa no rodapé
    ├── hooks/
    │   └── useWorkflow.ts      # Lógica dos hotkeys com guard anti-duplo-acionamento
    └── store/
        ├── configStore.ts      # Configuração da planilha (Zustand)
        └── workflowStore.ts    # Estado em execução (Zustand)
```

## Fluxo de execução

### 1. Setup
1. Selecionar arquivo `.xlsx`
2. Escolher qual aba é a **BASE** (todos os pontos) e qual é a **LISTAGEM** (REFs a processar)
3. Mapear as colunas: ID, REF, FOTO, CONDICAO
4. Definir o valor a gravar na coluna CONDICAO (ex: `OK`, `SIM`, `✓`)
5. Clicar em **Iniciar revisão**

### 2. Revisão (loop por REF)
- O sistema carrega todos os REFs da aba LISTAGEM
- Para cada REF, filtra os pontos da aba BASE e exibe as fotos em slideshow

| Hotkey | Ação |
|--------|------|
| **F1** | Fechar imagem atual / avançar para a próxima. Se for a última: dialog para ver novamente ou pular o REF |
| **F2** | Selecionar o ponto atual — grava o valor configurado na coluna CONDICAO. Dialog pergunta se deseja procurar outro no mesmo REF |
| **F3** | Encerrar a revisão e voltar ao Setup |

### 3. Escrita assíncrona (Worker Thread)
A gravação no Excel é completamente desacoplada da UI:

```
F2 pressionado
→ dialog aparece imediatamente
→ usuário responde → próxima foto carrega
↓ (Worker Thread separado, em paralelo)
→ XLSX.write() + fs.writeFile() (~3s, invisível ao usuário)
```

Se o usuário tentar fechar o app com gravações pendentes, um dialog pergunta se deseja aguardar a conclusão ou fechar sem salvar.

## IPC Channels

| Canal | Direção | Descrição |
|-------|---------|-----------|
| `dialog:select-file` | renderer → main | Abre file picker, retorna `{ filePath, sheetNames }` |
| `excel:read-columns` | renderer → main | Retorna `{ columns, preview }` de uma aba (com cache) |
| `workflow:start` | renderer → main | Inicializa AppState + Worker Thread de escrita |
| `workflow:write-result` | renderer → main | Enfileira escrita no worker (retorna imediatamente) |
| `workflow:next-ref` | renderer → main | Avança para o próximo REF |
| `workflow:restart-ref` | renderer → main | Reinicia imagens do REF atual |
| `workflow:end` | renderer → main | Drena a fila de escrita e encerra o worker |
| `dialog:confirm` | renderer → main | Dialog nativo com Cancelar como botão padrão |
| `shortcut:f1/f2/f3` | main → renderer | Emitido pelo shortcutManager ao pressionar F1/F2/F3 |

## Detalhes técnicos relevantes

**Detecção de tipo de URL:** o `ImageViewer` verifica se a URL termina em extensão de imagem (`.jpg`, `.png`, etc.). URLs de páginas HTML (ex: `.php?idponto=...`) são renderizadas em `<iframe>`, preservando a galeria original do site.

**Cache de workbook no setup:** o `ipcHandlers` mantém um cache `{ filePath, wb }` para evitar re-leitura do arquivo a cada troca de aba no dropdown de configuração.

**Índice de coluna pré-computado:** o `appState` encontra o índice numérico da coluna CONDICAO uma única vez no `initialize()` e o reutiliza em todas as escritas, eliminando parsing de cabeçalhos a cada F2.

**Busca de coluna por nome:** o `excelService` localiza colunas pelo nome do cabeçalho (case-insensitive), não por letra (`A`, `B`, `C`). Isso permite que o usuário use nomes reais das colunas nos dropdowns.

## Desenvolvimento

```bash
# Instalar dependências
npm install

# Iniciar em modo desenvolvimento (hot reload)
npm run dev

# Verificar tipos TypeScript
npm run typecheck

# Build de produção
npm run build

# Gerar instalador .exe (Windows)
npm run dist
```

## Planilha de teste

Criar um `.xlsx` com:

**Aba Base** (ex: `Pontos`):
| ID | REF | FOTO | CONDICAO |
|----|-----|------|----------|
| 1001 | TBT0513 | https://... | |
| 1002 | TBT0513 | https://... | |
| 1003 | TBT0518 | https://... | |

**Aba Lista** (ex: `Trafos`):
| TRAFO |
|-------|
| TBT0513 |
| TBT0518 |

No setup: selecionar o arquivo → mapear as abas → mapear as colunas → definir valor (ex: `OK`) → Iniciar.
