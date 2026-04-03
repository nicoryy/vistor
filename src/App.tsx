import { Routes, Route, Navigate } from 'react-router-dom'
import SetupPage from './pages/SetupPage'
import ReviewPage from './pages/ReviewPage'

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<SetupPage />} />
      <Route path="/review" element={<ReviewPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
