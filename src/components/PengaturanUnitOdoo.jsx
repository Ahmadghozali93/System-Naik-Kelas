import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Editor mapping Unit → ID company Odoo, dipakai di panel Pengaturan Odoo
// (SPP > Faktur Odoo dan Penjualan Buku > Faktur Odoo). Disimpan bersama
// pengaturan Odoo lain lewat saveOdooSettings({ unitCompany }).
//
// Disunting sebagai daftar baris [{ unit, id }] — bukan objek — supaya dua
// baris yang sedang diketik dengan nama sama tidak saling menimpa.
// Ubah ke objek lewat barisKeMapping() (lib/odooApi.js) saat menyimpan.

export default function PengaturanUnitOdoo({ baris, setBaris }) {
  const [units, setUnits] = useState([]);

  useEffect(() => {
    supabase.from('units').select('nama').then(({ data }) => setUnits((data || []).map(u => u.nama).filter(Boolean)));
  }, []);

  const ubah = (i, kolom, nilai) => setBaris(prev => prev.map((b, j) => j === i ? { ...b, [kolom]: nilai } : b));
  const hapus = (i) => setBaris(prev => prev.filter((_, j) => j !== i));
  const terpakai = new Set(baris.map(b => b.unit.trim()));
  const belumDipetakan = units.filter(u => !terpakai.has(u));
  const tambah = () => setBaris(prev => [...prev, { unit: belumDipetakan[0] || '', id: '' }]);

  const inp = { padding:'0.45rem 0.65rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)', background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.85rem', boxSizing:'border-box' };

  return (
    <div>
      <div style={{fontSize:'0.78rem',fontWeight:600,marginBottom:'0.4rem'}}>Mapping Unit → Odoo Company</div>
      <div style={{display:'flex',flexDirection:'column',gap:'0.4rem',maxWidth:460}}>
        {baris.map((b, i) => (
          <div key={i} style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
            <input list="daftar-unit-odoo" value={b.unit} placeholder="Nama unit" style={{...inp,flex:1,minWidth:0}}
              onChange={e => ubah(i, 'unit', e.target.value)}/>
            <span style={{fontSize:'0.8rem',color:'var(--text-secondary)'}}>ID</span>
            <input type="number" min="1" value={b.id} placeholder="ID" style={{...inp,width:80}}
              onChange={e => ubah(i, 'id', e.target.value)}/>
            <button type="button" onClick={() => hapus(i)} title="Hapus"
              style={{background:'none',border:'none',cursor:'pointer',color:'#ef4444',display:'flex'}}><Trash2 size={15}/></button>
          </div>
        ))}
        <datalist id="daftar-unit-odoo">{units.map(u => <option key={u} value={u}/>)}</datalist>
        <button type="button" onClick={tambah}
          style={{alignSelf:'flex-start',display:'flex',alignItems:'center',gap:'0.3rem',background:'none',border:'1px dashed var(--glass-border)',
            borderRadius:'0.5rem',padding:'0.35rem 0.7rem',cursor:'pointer',fontSize:'0.8rem',fontFamily:'inherit',color:'var(--primary)'}}>
          <Plus size={14}/> Tambah unit
        </button>
      </div>
      <div style={{fontSize:'0.75rem',color:'var(--text-secondary)',marginTop:'0.45rem'}}>
        Nama unit harus sama persis dengan nama unit di data siswa. ID company dilihat di Odoo (Pengaturan › Perusahaan).
        {belumDipetakan.length > 0 && <> Unit yang belum dipetakan: <b>{belumDipetakan.join(', ')}</b>.</>}
      </div>
    </div>
  );
}
