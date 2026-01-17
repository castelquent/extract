import { Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout'
import { ProjectsPage } from './pages/Projects'
import { ExtractionPage } from './pages/Extraction'
import { EditorPage } from './pages/Editor'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<ProjectsPage filter="all" />} />
        <Route path="/extraction" element={<ProjectsPage filter="extraction" />} />
        <Route path="/transcription" element={<ProjectsPage filter="transcription" />} />
        <Route path="/extraction/:projectId" element={<ExtractionPage />} />
        <Route path="/editor/:projectId" element={<EditorPage />} />
      </Route>
    </Routes>
  )
}

export default App
