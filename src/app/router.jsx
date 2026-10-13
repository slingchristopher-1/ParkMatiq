import { Routes, Route, Navigate } from 'react-router-dom'
import Login         from '../features/auth/pages/Login'
import Register      from '../features/auth/pages/Register'
import ResetPassword from '../features/auth/pages/ResetPassword'
import Onboarding    from '../features/onboarding/pages/Onboarding'
import Home          from '../features/parking-session/pages/Home'
import ActiveSession from '../features/parking-session/pages/ActiveSession'
import Summary       from '../features/receipts/pages/Summary'
import History       from '../features/parking-history/pages/History'
import Settings      from '../features/settings/pages/Settings'
import Privacy       from '../features/settings/pages/Privacy'

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login"      element={<Login />} />
      <Route path="/register"   element={<Register />} />
      <Route path="/reset"      element={<ResetPassword />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/"           element={<Home />} />
      <Route path="/session"    element={<ActiveSession />} />
      <Route path="/summary"    element={<Summary />} />
      <Route path="/history"    element={<History />} />
      <Route path="/settings"   element={<Settings />} />
      <Route path="/privacy"    element={<Privacy />} />
      <Route path="*"           element={<Navigate to="/" replace />} />
    </Routes>
  )
}
