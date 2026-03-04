import { useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet
} from 'react-router-dom';
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
import LandingPage from './pages/LandingPage';

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';


/* =========================
   DASHBOARD LAYOUT
========================= */

function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="app-container">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <main className="main-content">
        <header
          className="mobile-header d-md-none"
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '1.5rem'
          }}
        >
          <button
            onClick={() => setIsSidebarOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              marginRight: '1rem',
              color: 'var(--text-primary)'
            }}
          >
            <Menu className="w-6 h-6" />
          </button>

          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>
            Menu
          </h2>
        </header>

        {/* 🔥 INI WAJIB UNTUK NESTED ROUTE */}
        <Outlet />
      </main>
    </div>
  );
}


/* =========================
   APP ROUTING
========================= */

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          {/* PUBLIC ROUTES */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* PROTECTED LAYOUT */}
          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
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

            {/* FALLBACK */}
            <Route
              path="*"
              element={<Navigate to="/" replace />}
            />
          </Route>

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;