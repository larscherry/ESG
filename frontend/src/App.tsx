import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ErrorBoundary from './ErrorBoundary'
import Layout from './Layout'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Review from './pages/Review'
import Analytics from './pages/Analytics'

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="upload" element={<Upload />} />
          <Route path="review" element={<Review />} />
          <Route path="analytics" element={<Analytics />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
