import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { CompanyProvider } from './context/CompanyContext.jsx'
import { DialogProvider } from './components/ui/DialogProvider.jsx'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DialogProvider>
      <CompanyProvider>
        <App />
      </CompanyProvider>
    </DialogProvider>
  </React.StrictMode>
)
