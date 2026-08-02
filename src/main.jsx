import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { applyTheme, getStoredTheme } from './hooks/useTheme'
import './index.css'

// Set the theme before the first paint to avoid a flash of the wrong theme.
applyTheme(getStoredTheme())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
