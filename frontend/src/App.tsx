import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from '@/components/LoginPage'
import CallbackPage from '@/components/CallbackPage'
import ProjectLayout from '@/components/ProjectLayout'
import Layout from '@/components/Layout'
import KanbanBoard from '@/components/KanbanBoard'
import ProjectsPage from '@/components/ProjectsPage'
import DashboardPage from '@/components/DashboardPage'
import TeamsPage from '@/components/TeamsPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/callback" element={<CallbackPage />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/projects" replace />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<Navigate to="tasks" replace />} />
          <Route path="tasks" element={<KanbanBoard />} />
          <Route path="dashboard" element={<DashboardPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
