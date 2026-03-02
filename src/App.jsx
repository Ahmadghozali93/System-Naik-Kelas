import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './components/layout/Sidebar';
import UserPage from './pages/UserPage';
import UnitPage from './pages/UnitPage';
import SiswaPage from './pages/SiswaPage';
import ProgramPage from './pages/ProgramPage';
import JadwalMasterPage from './pages/JadwalMasterPage';
import AktivasiRutinPage from './pages/AktivasiRutinPage';
import AktivasiHarianPage from './pages/AktivasiHarianPage';
import KanbanBoard from './pages/KanbanBoard';
import BookingPage from './pages/BookingPage';
import JadwalKosongPage from './pages/JadwalKosongPage';
import ReschedulePage from './pages/ReschedulePage';
import LoginPage from './pages/LoginPage';
import RoleSetupPage from './pages/RoleSetupPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';

// Layout wrapper untuk halaman dashboard (yang punya sidebar)
function DashboardLayout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="app-container">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>
      )}
      <main className="main-content">
        <header className="mobile-header d-md-none" style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
          <button onClick={() => setIsSidebarOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: '1rem', color: 'var(--text-primary)' }}>
            <Menu className="w-6 h-6" />
          </button>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Menu</h2>
        </header>
        {children}
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/user" element={<UserPage />} />
                    <Route path="/unit" element={<UnitPage />} />
                    <Route path="/siswa" element={<SiswaPage />} />
                    <Route path="/program" element={<ProgramPage />} />
                    <Route path="/jadwal-master" element={<JadwalMasterPage />} />
                    <Route path="/aktivasi-rutin" element={<AktivasiRutinPage />} />
                    <Route path="/aktivasi-harian" element={<AktivasiHarianPage />} />
                    <Route path="/kanban" element={<KanbanBoard />} />
                    <Route path="/booking" element={<BookingPage />} />
                    <Route path="/jadwal-kosong" element={<JadwalKosongPage />} />
                    <Route path="/reschedule" element={<ReschedulePage />} />
                    <Route path="/role-setup" element={<RoleSetupPage />} />
                    <Route path="/pengaturan" element={<SettingsPage />} />
                  </Routes>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
