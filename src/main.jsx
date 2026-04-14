import React from 'react'
import ReactDOM from 'react-dom/client'
import { CompanyProvider } from './context/CompanyContext.jsx'
import App from '../research_hub.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CompanyProvider>
      <App />
    </CompanyProvider>
  </React.StrictMode>
)
