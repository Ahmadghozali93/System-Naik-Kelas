import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Hak payroll akun yang sedang login, langsung dari sumber yang sama
 * dengan RLS (RPC payroll_hak_saya, migrasi 0016).
 *
 * Dipakai agar form tidak menawarkan pilihan yang pasti ditolak database:
 * pengelola cabang hanya boleh menulis baris milik cabangnya, dan baris
 * "Semua cabang" (unit_id NULL) hanya milik Owner.
 *
 * @returns {{
 *   loading:boolean, isOwner:boolean, bolehKelola:boolean,
 *   unitIds:string[], batasiCabang:boolean
 * }}
 *   batasiCabang — true bila pilihan cabang di form harus dipersempit ke
 *   unitIds. False untuk Owner, dan false juga bila hak gagal dibaca
 *   (UI dibiarkan apa adanya; RLS + trigger 0016 tetap menjaga).
 */
export function useHakPayroll() {
  const [hak, setHak] = useState({
    loading: true, isOwner: false, bolehKelola: true, unitIds: [], batasiCabang: false,
  });

  useEffect(() => {
    let active = true;

    (async () => {
      const { data, error } = await supabase.rpc('payroll_hak_saya');
      if (!active) return;

      if (error || !data) {
        setHak({ loading: false, isOwner: false, bolehKelola: true, unitIds: [], batasiCabang: false });
        return;
      }

      const isOwner = !!data.is_owner;
      setHak({
        loading: false,
        isOwner,
        bolehKelola: !!data.boleh_kelola,
        unitIds: data.unit_ids || [],
        batasiCabang: !isOwner,
      });
    })();

    return () => { active = false; };
  }, []);

  return hak;
}
