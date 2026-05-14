import * as Sentry from '@sentry/electron/renderer'
import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  createHashRouter,
  RouterProvider,
} from 'react-router-dom'
import App from './App'
import './styles/index.css'

// Renderer Sentry init. The main process supplies the DSN through its own
// init — this call wires the renderer-side handler to the same event
// stream. No-op in dev (main skips init when not packaged).
Sentry.init({})

const router = createHashRouter([
  {
    path: '/*',
    element: <App />,
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
