import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './theme.css'
import { App } from './App'

// A versão nova só entra na próxima vez que o app for aberto: nunca recarrega a tela no meio do culto.
registerSW({ immediate: true, onNeedRefresh() {} })

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
