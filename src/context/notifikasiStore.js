import { createContext, useContext } from 'react';

// Dipisah dari Provider (lihat authStore.js) agar Fast Refresh bekerja dan
// halaman bisa memanggil useNotifikasi tanpa memuat ulang Provider.
// Default null: komponen di luar DashboardLayout tetap aman memanggilnya.
export const NotifikasiContext = createContext(null);

export const useNotifikasi = () => useContext(NotifikasiContext);
