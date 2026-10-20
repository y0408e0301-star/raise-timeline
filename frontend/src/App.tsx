import { Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { GuestOnly, RequireAuth } from './auth/guards'
import Layout from './components/Layout'
import { ToastProvider } from './components/ToastProvider'
import FollowsPage from './pages/FollowsPage'
import HomePage from './pages/HomePage'
import LikesPage from './pages/LikesPage'
import LoginPage from './pages/LoginPage'
import PostPage from './pages/PostPage'
import ProfilePage from './pages/ProfilePage'
import SignupPage from './pages/SignupPage'

// 画面と URL（画面一覧 2 章）。BrowserRouter（テストでは MemoryRouter）の中で使う
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            {/* G-3〜G-9 はヘッダーつき */}
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/posts/:id" element={<PostPage />} />
              <Route path="/posts/:id/likes" element={<LikesPage />} />
              <Route path="/users/:username" element={<ProfilePage />} />
              <Route path="/users/:username/following" element={<FollowsPage kind="following" />} />
              <Route path="/users/:username/followers" element={<FollowsPage kind="followers" />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}
