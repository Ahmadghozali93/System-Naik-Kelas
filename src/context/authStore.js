import { createContext, useContext } from 'react';

// Context dipisah dari komponen Provider agar Fast Refresh bekerja optimal
// dan agar hook useAuth bisa diimpor tanpa memuat ulang Provider.
export const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);
