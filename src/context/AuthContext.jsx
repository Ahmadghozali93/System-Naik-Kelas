import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Cek localStorage saat aplikasi pertama kali dimuat
        const storedUser = localStorage.getItem('bimbel_user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            fetchPermissions(parsedUser.role);
        } else {
            setLoading(false);
        }
    }, []);

    const fetchPermissions = async (roleName) => {
        try {
            const { data, error } = await supabase
                .from('roles')
                .select('allowed_menus')
                .eq('role_name', roleName)
                .single();

            if (error) {
                console.error("Error fetching permissions:", error);
                // Jika error (misal tabel belum ada), beri akses kosong atau default sementara
                setPermissions([]);
            } else if (data) {
                setPermissions(data.allowed_menus);
            }
        } catch (err) {
            console.error("Terjadi kesalahan saat mengambil permission:", err);
            setPermissions([]);
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        setLoading(true);
        try {
            // Karena kita pakai tabel custom 'gurus', kita query manual.
            // PENTING: Di produksi, JANGAN simpan/pakai password plain text. Gunakan Supabase Auth!
            const { data, error } = await supabase
                .from('gurus')
                .select('*')
                .eq('email', email)
                .eq('password', password)
                .eq('status', 'Aktif') // Hanya user aktif yang boleh login
                .single();

            if (error || !data) {
                throw new Error('Email atau Password salah, atau akun tidak aktif.');
            }

            // Simpan info dasar user (tanpa password)
            const userInfo = {
                id: data.id,
                nama: data.nama,
                email: data.email,
                role: data.role
            };

            setUser(userInfo);
            localStorage.setItem('bimbel_user', JSON.stringify(userInfo));

            // Ambil daftar menu yang dibolehkan untuk role user ini
            await fetchPermissions(data.role);

            return { success: true };

        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        setUser(null);
        setPermissions([]);
        localStorage.removeItem('bimbel_user');
    };

    return (
        <AuthContext.Provider value={{ user, permissions, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
