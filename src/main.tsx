import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './theme.css'
import { App } from './App'

// Versão nova: só recarrega logo ao abrir o app (nos primeiros segundos, sem nada digitado). Depois disso, espera a próxima abertura,
// para nunca recarregar a tela no meio do culto.
const openedAt = Date.now()
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (Date.now() - openedAt < 8000) void updateSW(true)
  },
})

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
