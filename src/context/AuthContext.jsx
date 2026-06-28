import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AuthContext } from './authStore';

export const AuthProvider = ({ children }) => {
    const [session, setSession] = useState(null);
    const [user, setUser] = useState(null);          // { id, nama, email, role }
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);

    // 1) Pantau sesi Supabase Auth (JWT asli, bukan localStorage manual)
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (!session) setLoading(false);
        });

        // Callback hanya menyimpan sesi (anti-deadlock: tidak await query di sini)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, newSession) => setSession(newSession)
        );

        return () => subscription?.unsubscribe();
    }, []);

    // 2) Saat sesi berubah, muat profil guru + permission dari DB
    useEffect(() => {
        let active = true;

        (async () => {
            if (!session?.user) {
                if (active) { setUser(null); setPermissions([]); setLoading(false); }
                return;
            }

            const { data: profile, error } = await supabase
                .from('gurus')
                .select('id, nama, email, role, status')
                .eq('auth_user_id', session.user.id)
                .single();

            if (!active) return;

            // Profil tidak ada / akun belum diaktifkan admin -> keluarkan
            if (error || !profile || profile.status !== 'Aktif') {
                await supabase.auth.signOut();
                setUser(null);
                setPermissions([]);
                setLoading(false);
                return;
            }

            setUser({ id: profile.id, nama: profile.nama, email: profile.email, role: profile.role });

            const { data: roleRow } = await supabase
                .from('roles')
                .select('allowed_menus')
                .eq('role_name', profile.role)
                .single();

            if (active) {
                setPermissions(roleRow?.allowed_menus || []);
                setLoading(false);
            }
        })();

        return () => { active = false; };
    }, [session]);

    const login = async (email, password) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw new Error('Email atau Password salah.');

            // Cek status aktif untuk pesan error yang jelas (profil dimuat oleh effect di atas)
            const { data: profile } = await supabase
                .from('gurus')
                .select('status')
                .eq('auth_user_id', data.user.id)
                .single();

            if (!profile || profile.status !== 'Aktif') {
                await supabase.auth.signOut();
                throw new Error('Akun belum aktif. Hubungi admin untuk aktivasi.');
            }
            return { success: true };
        } catch (e) {
            setLoading(false);
            return { success: false, error: e.message };
        }
    };

    // Pendaftaran lewat Supabase Auth. Trigger DB akan membuat profil 'Tidak Aktif'.
    const signUp = async ({ email, password, nama, nowa, alamat, maps, tanggal_lahir }) => {
        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { nama, nowa, alamat, maps, tanggal_lahir } },
            });
            if (error) throw error;
            // Jangan biarkan user langsung "login" sebelum diaktivasi admin
            await supabase.auth.signOut();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setPermissions([]);
    };

    return (
        <AuthContext.Provider value={{ user, permissions, login, signUp, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
