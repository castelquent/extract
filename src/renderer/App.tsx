import { Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout'
import { ProjectsPage } from './pages/Projects'
import { ProjectDetailPage } from './pages/Project'
import { ExtractionV2Page } from './pages/ExtractionV2'
import { EditorV2Page } from './pages/EditorV2'
import { TemplatesPage } from './pages/Templates'
import { SearchPage } from './pages/Search'
import { OnboardingPage } from './pages/Onboarding'
import { WindowCloseHandler } from './components/WindowCloseHandler'
import { UpdateHandler } from './components/UpdateHandler'

function App() {
  return (
    <>
      <WindowCloseHandler />
      <UpdateHandler />
      <Routes>
        <Route path="/welcome" element={<OnboardingPage />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/project/:projectId" element={<ProjectDetailPage />} />
          <Route path="/extraction/:projectId/:sourceId" element={<ExtractionV2Page />} />
          <Route path="/editor/:projectId" element={<EditorV2Page />} />
        </Route>
      </Routes>
    </>
  )
}

export default App
