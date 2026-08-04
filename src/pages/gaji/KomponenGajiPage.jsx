import { useState, useEffect } from 'react';
import { Plus, X, Pencil, Trash2, Wallet, PlayCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

import { useHakPayroll } from '../../hooks/useHakPayroll';
import { formatRupiah } from '../../utils/formatRupiah';
import SlipGajiPrintable from '../../components/gaji/SlipGajiPrintable';
import { dariSimulasi } from '../../utils/slipModel';

const TIPE = [
  { value: 'nominal_tetap', label: 'Nominal Tetap',  desc: 'Angka pasti tiap bulan. Contoh: gaji pokok, tunjangan.' },
  { value: 'per_unit',      label: 'Per Unit',       desc: 'Jumlah tatap muka × tarif. Diambil dari Jurnal Mengajar.' },
  { value: 'bersyarat',     label: 'Bersyarat',      desc: 'Cair penuh bila syarat terpenuhi. Contoh: bonus kehadiran.' },
  { value: 'bertingkat',    label: 'Bertingkat',     desc: 'Tangga pencapaian dari skor KPI (diatur di sini).' },
  { value: 'ambil_kpi',     label: 'Ambil dari Bonus KPI', desc: 'Menarik nominal bonus yang sudah dihitung modul KPI (Tier Bonus). Tidak perlu atur tangga lagi.' },
];
const KATEGORI = [
  { value: 'pendapatan', label: 'Pendapatan (menambah gaji)' },
  { value: 'potongan',   label: 'Potongan (mengurangi gaji)' },
];
const BULAN = ['', 'Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

const inp = { padding:'0.55rem 0.75rem', borderRadius:'0.5rem', border:'1px solid var(--glass-border)',
  background:'var(--surface-color)', fontFamily:'inherit', fontSize:'0.88rem', width:'100%', boxSizing:'border-box' };
const lbl = { fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:'0.3rem' };

const EMPTY = { kode:'', nama:'', kategori:'pendapatan', tipe_perhitungan:'nominal_tetap',
  unit_id:'', urutan_tampil:0, aktif:false, konfigurasi:{} };

// Memeriksa kelengkapan konfigurasi. Mengembalikan daftar bagian yang kurang.
function cekKelengkapan(tipe, cfg) {
  const kurang = [];
  const c = cfg || {};
  if (tipe === 'nominal_tetap') {
    if (!(Number(c.nominal) > 0)) kurang.push('Nominal belum diisi');
  }
  if (tipe === 'per_unit') {
    const m = c.matriks_tarif || [];
    if (m.length === 0) kurang.push('Tarif per program belum ada satu pun');
    if (m.some(r => !r.program_id)) kurang.push('Ada baris tarif yang programnya belum dipilih');
    if (m.some(r => !(Number(r.tarif) > 0))) kurang.push('Ada baris tarif yang nominalnya kosong');
  }
  if (tipe === 'bersyarat') {
    if (!(Number(c.nominal) > 0)) kurang.push('Nominal bonus belum diisi');
    if (!(c.status_absensi_menghanguskan || []).length)
      kurang.push('Belum memilih status absensi yang menghanguskan bonus');
  }
  if (tipe === 'bertingkat') {
    const t = c.tangga || [];
    if (t.length === 0) kurang.push('Tangga pencapaian belum ada satu pun');
    if (t.some(r => r.min === '' || r.min === undefined)) kurang.push('Ada tangga yang batas minimalnya kosong');
    if (t.some(r => !(Number(r.nominal) > 0))) kurang.push('Ada tangga yang nominalnya kosong');
  }
  return kurang;
}

export default function KomponenGajiPage() {

  const hak = useHakPayroll();
  const [rows, setRows]         = useState([]);
  const [units, setUnits]       = useState([]);
  const [programs, setPrograms] = useState([]);
  const [gurus, setGurus]       = useState([]);
  const [statusAbsensi, setStatusAbsensi] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const [modal, setModal]   = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm]     = useState(EMPTY);

  // Uji coba hitung
  const [ujiOpen, setUjiOpen]   = useState(false);
  const [ujiForm, setUjiForm]   = useState({ guru_id:'', tahun:new Date().getFullYear(), bulan:new Date().getMonth()+1 });
  const [ujiHasil, setUjiHasil] = useState(null);
  const [ujiMeta, setUjiMeta]   = useState(null);   // { nama, bulan, tahun } untuk pratinjau slip
  const [ujiLoading, setUjiLoading] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [kRes, uRes, pRes, gRes, aRes] = await Promise.all([
      supabase.from('komponen_gaji').select('*').order('urutan_tampil').order('nama'),
      supabase.from('units').select('id, nama').eq('aktif', true).order('nama'),
      supabase.from('programs').select('id, nama').order('nama'),
      supabase.from('gurus').select('id, nama, role').eq('status','Aktif').order('nama'),
      // Status absensi tidak punya tabel master — ambil nilai yang benar-benar dipakai
      supabase.from('attendances').select('status').limit(1000),
    ]);
    setRows(kRes.data || []);
    setUnits(uRes.data || []);
    setPrograms(pRes.data || []);
    setGurus(gRes.data || []);
    // Status bawaan selalu ditampilkan, supaya aturan bonus bisa disetel
    // SEBELUM status itu pernah muncul di data (mis. 'Izin Tanpa Pengganti').
    const BAWAAN = ['Hadir','Telat','Izin','Izin Tanpa Pengganti','Sakit','Cuti','Alpha'];
    const dariData = (aRes.data || []).map(a => a.status).filter(Boolean);
    setStatusAbsensi([...new Set([...BAWAAN, ...dariData])]);
    setLoading(false);
  };

  // ── Batas cabang ──
  // Pengelola non-Owner hanya boleh menulis komponen milik cabangnya:
  // komponen "Semua cabang" (unit_id NULL) tetap milik Owner. Pilihan yang
  // pasti ditolak database tidak ditawarkan di form.
  const unitPilihan = hak.batasiCabang ? units.filter(u => hak.unitIds.includes(u.id)) : units;
  const bisaTulis   = (r) => !hak.batasiCabang || (!!r.unit_id && hak.unitIds.includes(r.unit_id));
  const bisaTambah  = hak.bolehKelola && (!hak.batasiCabang || unitPilihan.length > 0);
  const alasanTakBisaTambah = !hak.bolehKelola
    ? 'Akun Anda belum diberi izin "Kelola Payroll". Minta Owner menyalakannya di menu User.'
    : 'Akun Anda belum ditugaskan ke cabang mana pun, jadi belum ada cabang yang bisa dipilih.';

  const openAdd  = () => {
    if (!bisaTambah) return alert(alasanTakBisaTambah);
    setEditId(null);
    // Non-Owner tidak punya opsi "Semua cabang", jadi cabang pertamanya dipilihkan.
    setForm({ ...EMPTY, unit_id: hak.batasiCabang ? unitPilihan[0].id : '' });
    setModal(true);
  };
  const openEdit = (r) => {
    setEditId(r.id);
    setForm({ kode:r.kode, nama:r.nama, kategori:r.kategori, tipe_perhitungan:r.tipe_perhitungan,
      unit_id:r.unit_id || '', urutan_tampil:r.urutan_tampil, aktif:r.aktif,
      konfigurasi: r.konfigurasi || {} });
    setModal(true);
  };

  const setCfg = (patch) => setForm(f => ({ ...f, konfigurasi: { ...f.konfigurasi, ...patch } }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.kode.trim() || !form.nama.trim()) return alert('Kode dan Nama wajib diisi.');
    if (hak.batasiCabang && !form.unit_id)
      return alert('Pilih cabang dulu. Komponen untuk semua cabang hanya bisa dibuat Owner.');

    // Sistem menolak mengaktifkan komponen yang konfigurasinya belum lengkap
    if (form.aktif) {
      const kurang = cekKelengkapan(form.tipe_perhitungan, form.konfigurasi);
      if (kurang.length) {
        return alert('Komponen belum bisa diaktifkan. Yang masih kurang:\n\n• ' + kurang.join('\n• '));
      }
    }

    setSaving(true);
    const payload = {
      kode: form.kode.trim().toUpperCase(), nama: form.nama.trim(),
      kategori: form.kategori, tipe_perhitungan: form.tipe_perhitungan,
      unit_id: form.unit_id || null, urutan_tampil: Number(form.urutan_tampil) || 0,
      aktif: form.aktif,
      konfigurasi: Object.keys(form.konfigurasi || {}).length ? form.konfigurasi : null,
    };
    const { error } = editId
      ? await supabase.from('komponen_gaji').update(payload).eq('id', editId)
      : await supabase.from('komponen_gaji').insert(payload);
    setSaving(false);
    if (error) {
      if (error.code === '23505') return alert('Kode komponen sudah dipakai. Gunakan kode lain.');
      return alert('Gagal: ' + error.message);
    }
    setModal(false); loadAll();
  };

  const hapus = async (r) => {
    if (!window.confirm(`Hapus komponen "${r.nama}"?`)) return;
    const { error } = await supabase.from('komponen_gaji').delete().eq('id', r.id);
    if (error) return alert('Gagal hapus: ' + error.message + '\n\nKomponen yang sudah dipakai di slip tidak bisa dihapus.');
    loadAll();
  };

  // ── Uji Coba Hitung: tidak menyimpan apa pun ──
  const jalankanUji = async () => {
    if (!ujiForm.guru_id) return alert('Pilih karyawan dulu.');
    setUjiLoading(true); setUjiHasil(null);

    // Cari/siapkan periode draft untuk simulasi. Sejak 0020 periode bersifat
    // global — satu per bulan untuk seluruh perusahaan, tanpa unit_id — dan
    // mesin hitung tidak lagi menyaring lewat guru_units.
    const guru = gurus.find(g => g.id === ujiForm.guru_id);

    let { data: per } = await supabase.from('periode_payroll').select('id, status')
      .eq('tahun', ujiForm.tahun).eq('bulan', ujiForm.bulan).maybeSingle();

    if (!per) {
      if (!window.confirm(`Belum ada periode ${BULAN[ujiForm.bulan]} ${ujiForm.tahun}.\n\n`
        + 'Uji coba membutuhkan periode, jadi periode draft akan dibuat sekarang '
        + 'dan tetap ada setelah uji coba selesai. Lanjutkan?')) {
        setUjiLoading(false); return;
      }
      const { data: baru, error } = await supabase.from('periode_payroll')
        .insert({ tahun: ujiForm.tahun, bulan: ujiForm.bulan, status: 'draft' })
        .select('id, status').single();
      if (error) { setUjiLoading(false); return alert('Gagal menyiapkan periode uji: ' + error.message); }
      per = baru;
    }
    if (per.status !== 'draft') {
      setUjiLoading(false);
      return alert(`Periode ${BULAN[ujiForm.bulan]} ${ujiForm.tahun} sudah ${per.status}. Uji coba hanya bisa pada periode draft.`);
    }

    const { data, error } = await supabase.rpc('simulasi_slip_gaji',
      { p_periode_id: per.id, p_guru_id: ujiForm.guru_id });
    setUjiLoading(false);
    if (error) return alert('Perhitungan ditolak:\n\n' + error.message);
    setUjiHasil(data);
    setUjiMeta({ nama: guru?.nama, jabatan: guru?.role, bulan: ujiForm.bulan, tahun: ujiForm.tahun });
  };

  const tipeLabel = (v) => TIPE.find(t => t.value === v)?.label || v;
  const kurangSekarang = cekKelengkapan(form.tipe_perhitungan, form.konfigurasi);

  return (
    <div>
      <div style={{ marginBottom:'1.25rem', display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <p style={{ fontSize:'0.72rem', color:'var(--text-secondary)', margin:0, textTransform:'uppercase', letterSpacing:'0.05em' }}>Payroll</p>
          <h1 style={{ fontSize:'1.6rem', fontWeight:700, margin:0 }}>Komponen Gaji</h1>
          <p style={{ fontSize:'0.85rem', color:'var(--text-secondary)', margin:'0.25rem 0 0' }}>
            Atur sendiri aturan tiap jenis pembayaran. Komponen baru mulai berlaku setelah diaktifkan.
          </p>
        </div>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          <button className="btn" onClick={() => { setUjiOpen(true); setUjiHasil(null); }}
            style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
            <PlayCircle size={16} /> Uji Coba Hitung
          </button>
          <button className="btn btn-primary" onClick={openAdd} disabled={hak.loading || loading || !bisaTambah}
            title={bisaTambah ? undefined : alasanTakBisaTambah}
            style={{ display:'flex', alignItems:'center', gap:'0.4rem', opacity: (hak.loading || loading || bisaTambah) ? 1 : 0.5 }}>
            <Plus size={16} /> Tambah Komponen
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ padding:'1.5rem' }}>
        {loading ? <p style={{ color:'var(--text-secondary)' }}>Memuat...</p>
        : rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-secondary)' }}>
            <Wallet size={40} style={{ opacity:0.3, marginBottom:'0.75rem' }} />
            <p>Belum ada komponen gaji.</p>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--glass-border)', background:'rgba(79,70,229,0.04)' }}>
                  {['Kode','Nama','Kategori','Cara Hitung','Cabang','Status','Aksi'].map(h => (
                    <th key={h} style={{ padding:'0.65rem 0.75rem', textAlign:'left', fontWeight:700, fontSize:'0.72rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const kurang = cekKelengkapan(r.tipe_perhitungan, r.konfigurasi);
                  return (
                    <tr key={r.id} style={{ borderBottom:'1px solid var(--glass-border)' }}>
                      <td style={{ padding:'0.7rem 0.75rem', fontFamily:'monospace', fontSize:'0.8rem', color:'var(--text-secondary)' }}>{r.kode}</td>
                      <td style={{ padding:'0.7rem 0.75rem', fontWeight:600 }}>{r.nama}</td>
                      <td style={{ padding:'0.7rem 0.75rem' }}>
                        <span style={{ background: r.kategori==='pendapatan' ? '#d1fae5' : '#fee2e2',
                          color: r.kategori==='pendapatan' ? '#047857' : '#b91c1c',
                          padding:'0.15rem 0.55rem', borderRadius:999, fontSize:'0.75rem', fontWeight:700 }}>
                          {r.kategori === 'pendapatan' ? 'Pendapatan' : 'Potongan'}
                        </span>
                      </td>
                      <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)' }}>{tipeLabel(r.tipe_perhitungan)}</td>
                      <td style={{ padding:'0.7rem 0.75rem', color:'var(--text-secondary)' }}>
                        {r.unit_id ? (units.find(u=>u.id===r.unit_id)?.nama || r.unit_id) : 'Semua cabang'}
                      </td>
                      <td style={{ padding:'0.7rem 0.75rem' }}>
                        {r.aktif
                          ? <span style={{ background:'#d1fae5', color:'#047857', padding:'0.15rem 0.55rem', borderRadius:999, fontSize:'0.75rem', fontWeight:700 }}>Aktif</span>
                          : <span style={{ background:'#f3f4f6', color:'#6b7280', padding:'0.15rem 0.55rem', borderRadius:999, fontSize:'0.75rem', fontWeight:700 }}>Nonaktif</span>}
                        {kurang.length > 0 && (
                          <div title={kurang.join(', ')} style={{ marginTop:'0.25rem', display:'inline-flex', alignItems:'center', gap:'0.2rem', color:'#b45309', fontSize:'0.7rem', fontWeight:600 }}>
                            <AlertTriangle size={11} /> belum lengkap
                          </div>
                        )}
                      </td>
                      <td style={{ padding:'0.7rem 0.75rem' }}>
                        <div style={{ display:'flex', gap:'0.35rem' }}>
                          {bisaTulis(r) ? (
                            <>
                              <button onClick={()=>openEdit(r)} title="Ubah"
                                style={{ background:'rgba(79,70,229,0.1)', border:'none', borderRadius:'0.4rem', padding:'0.3rem 0.5rem', cursor:'pointer', color:'var(--primary)' }}>
                                <Pencil size={13} />
                              </button>
                              <button onClick={()=>hapus(r)} title="Hapus"
                                style={{ background:'#fee2e2', border:'none', borderRadius:'0.4rem', padding:'0.3rem 0.5rem', cursor:'pointer', color:'#b91c1c' }}>
                                <Trash2 size={13} />
                              </button>
                            </>
                          ) : (
                            <span title={r.unit_id ? 'Komponen milik cabang lain' : 'Komponen untuk semua cabang — hanya Owner yang bisa mengubah'}
                              style={{ fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                              hanya baca
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══ MODAL TAMBAH/UBAH ══ */}
      {modal && (
        <div className="modal-overlay" style={{ alignItems:'flex-start', paddingTop:'2rem' }}>
          <div className="modal-content" style={{ maxWidth:640, maxHeight:'88vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.1rem', margin:0 }}>{editId ? 'Ubah Komponen' : 'Tambah Komponen'}</h2>
              <button onClick={()=>setModal(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20}/></button>
            </div>

            <form onSubmit={handleSave} style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:'0.65rem' }}>
                <div>
                  <label style={lbl}>Kode *</label>
                  <input required value={form.kode} onChange={e=>setForm(f=>({...f,kode:e.target.value}))}
                    placeholder="GAJI_POKOK" style={{...inp, fontFamily:'monospace'}} />
                </div>
                <div>
                  <label style={lbl}>Nama Komponen *</label>
                  <input required value={form.nama} onChange={e=>setForm(f=>({...f,nama:e.target.value}))}
                    placeholder="Gaji Pokok" style={inp} />
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                <div>
                  <label style={lbl}>Kategori *</label>
                  <select value={form.kategori} onChange={e=>setForm(f=>({...f,kategori:e.target.value}))} style={inp}>
                    {KATEGORI.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Berlaku di Cabang {hak.batasiCabang && '*'}</label>
                  <select value={form.unit_id} onChange={e=>setForm(f=>({...f,unit_id:e.target.value}))} style={inp}>
                    {!hak.batasiCabang && <option value="">Semua cabang</option>}
                    {unitPilihan.map(u => <option key={u.id} value={u.id}>{u.nama}</option>)}
                  </select>
                  {hak.batasiCabang && (
                    <p style={{ margin:'0.3rem 0 0', fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                      Komponen untuk semua cabang hanya bisa dibuat Owner.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label style={lbl}>Cara Menghitung *</label>
                <select value={form.tipe_perhitungan}
                  onChange={e=>setForm(f=>({...f, tipe_perhitungan:e.target.value, konfigurasi:{}}))} style={inp}>
                  {TIPE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <p style={{ margin:'0.3rem 0 0', fontSize:'0.75rem', color:'var(--text-secondary)' }}>
                  {TIPE.find(t=>t.value===form.tipe_perhitungan)?.desc}
                </p>
              </div>

              {/* ══ FORM BERUBAH SESUAI TIPE ══ */}
              <div style={{ border:'1px solid var(--glass-border)', borderRadius:'0.6rem', padding:'1rem', background:'rgba(79,70,229,0.02)' }}>
                <p style={{ margin:'0 0 0.85rem', fontSize:'0.78rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--text-secondary)' }}>
                  Pengaturan {tipeLabel(form.tipe_perhitungan)}
                </p>

                {form.tipe_perhitungan === 'nominal_tetap' && (
                  <div>
                    <label style={lbl}>Nominal per Bulan (Rp)</label>
                    <input type="number" min={0} step={1000} value={form.konfigurasi.nominal ?? ''}
                      onChange={e=>setCfg({ nominal: e.target.value === '' ? undefined : Number(e.target.value) })}
                      style={inp} placeholder="Contoh: 1500000" />
                    {form.konfigurasi.nominal > 0 && (
                      <p style={{ margin:'0.25rem 0 0', fontSize:'0.78rem', color:'#047857', fontWeight:600 }}>
                        = {formatRupiah(form.konfigurasi.nominal)}
                      </p>
                    )}
                  </div>
                )}

                {form.tipe_perhitungan === 'per_unit' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
                    <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'0.5rem', padding:'0.6rem 0.8rem', fontSize:'0.78rem', color:'#1e40af' }}>
                      Jumlah tatap muka dihitung dari <strong>Jurnal Mengajar</strong>. Satu baris jurnal = satu siswa = satu unit dibayar.
                    </div>

                    <div>
                      <label style={lbl}>Tarif per Program</label>
                      <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                        {(form.konfigurasi.matriks_tarif || []).map((row, i) => (
                          <div key={i} style={{ display:'flex', gap:'0.4rem', alignItems:'center' }}>
                            <select value={row.program_id || ''} style={{...inp, flex:2}}
                              onChange={e=>{
                                const m=[...form.konfigurasi.matriks_tarif]; m[i]={...m[i],program_id:e.target.value}; setCfg({matriks_tarif:m});
                              }}>
                              <option value="">— Pilih program —</option>
                              {programs.map(p => <option key={p.id} value={p.id}>{p.nama}</option>)}
                            </select>
                            <input type="number" min={0} step={1000} value={row.tarif ?? ''} placeholder="Tarif"
                              style={{...inp, flex:1}}
                              onChange={e=>{
                                const m=[...form.konfigurasi.matriks_tarif];
                                m[i]={...m[i],tarif: e.target.value===''?undefined:Number(e.target.value)}; setCfg({matriks_tarif:m});
                              }} />
                            <button type="button" title="Hapus baris"
                              onClick={()=>setCfg({ matriks_tarif: form.konfigurasi.matriks_tarif.filter((_,x)=>x!==i) })}
                              style={{ background:'#fee2e2', border:'none', borderRadius:'0.4rem', padding:'0.5rem', cursor:'pointer', color:'#b91c1c' }}>
                              <Trash2 size={13}/>
                            </button>
                          </div>
                        ))}
                      </div>
                      <button type="button"
                        onClick={()=>setCfg({ matriks_tarif: [...(form.konfigurasi.matriks_tarif||[]), { program_id:'', tarif:undefined }] })}
                        style={{ marginTop:'0.5rem', background:'rgba(79,70,229,0.1)', border:'none', borderRadius:'0.4rem', padding:'0.4rem 0.75rem', cursor:'pointer', color:'var(--primary)', fontWeight:600, fontSize:'0.8rem', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                        <Plus size={13}/> Tambah baris tarif
                      </button>
                      <p style={{ margin:'0.4rem 0 0', fontSize:'0.75rem', color:'var(--text-secondary)' }}>
                        Jurnal dengan program di luar daftar ini <strong>tidak dibayar</strong>, dan akan muncul sebagai peringatan di slip.
                      </p>
                    </div>

                    <div>
                      <label style={lbl}>Batas Jurnal per Hari</label>
                      <input type="number" min={1} value={form.konfigurasi.batas_jurnal_per_hari ?? ''}
                        onChange={e=>setCfg({ batas_jurnal_per_hari: e.target.value===''?null:Number(e.target.value) })}
                        style={inp} placeholder="Kosongkan = tanpa batas" />
                      <p style={{ margin:'0.25rem 0 0', fontSize:'0.75rem', color:'var(--text-secondary)' }}>
                        Kelebihannya tidak dibayar, dan slip ditandai perlu ditinjau.
                      </p>
                    </div>

                    <label style={{ display:'flex', alignItems:'flex-start', gap:'0.5rem', fontSize:'0.82rem', cursor:'pointer' }}>
                      <input type="checkbox" checked={!!form.konfigurasi.wajib_terverifikasi}
                        onChange={e=>setCfg({ wajib_terverifikasi: e.target.checked })}
                        style={{ accentColor:'var(--primary)', marginTop:'0.15rem' }} />
                      <span>
                        Hanya hitung jurnal yang sudah diverifikasi
                        <span style={{ display:'block', color:'#b45309', fontSize:'0.75rem', marginTop:'0.15rem' }}>
                          ⚠️ Belum bisa dipakai — jurnal belum punya fitur verifikasi. Kalau dinyalakan, perhitungan akan ditolak.
                        </span>
                      </span>
                    </label>
                  </div>
                )}

                {form.tipe_perhitungan === 'bersyarat' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
                    <div>
                      <label style={lbl}>Nominal Bonus (Rp)</label>
                      <input type="number" min={0} step={1000} value={form.konfigurasi.nominal ?? ''}
                        onChange={e=>setCfg({ nominal: e.target.value===''?undefined:Number(e.target.value) })}
                        style={inp} placeholder="Contoh: 300000" />
                    </div>
                    <div>
                      <label style={lbl}>Status Absensi yang Menghanguskan Bonus</label>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem' }}>
                        {statusAbsensi.map(s => {
                          const dipilih = (form.konfigurasi.status_absensi_menghanguskan || []).includes(s);
                          return (
                            <label key={s} style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontSize:'0.82rem', cursor:'pointer',
                              border:`1px solid ${dipilih?'var(--primary)':'var(--glass-border)'}`, background:dipilih?'rgba(79,70,229,0.08)':'var(--surface-color)',
                              borderRadius:'0.4rem', padding:'0.35rem 0.6rem' }}>
                              <input type="checkbox" checked={dipilih} style={{ accentColor:'var(--primary)' }}
                                onChange={e=>{
                                  const cur = form.konfigurasi.status_absensi_menghanguskan || [];
                                  setCfg({ status_absensi_menghanguskan: e.target.checked ? [...cur,s] : cur.filter(x=>x!==s) });
                                }} />
                              {s}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                      <div>
                        <label style={lbl}>Batas Toleransi Telat</label>
                        <input type="number" min={0} value={form.konfigurasi.batas_telat ?? ''}
                          onChange={e=>setCfg({ batas_telat: e.target.value===''?null:Number(e.target.value) })}
                          style={inp} placeholder="Kosongkan = tidak ada toleransi" />
                      </div>
                      <div>
                        <label style={lbl}>Kalau Melanggar</label>
                        <select value={form.konfigurasi.cara_hangus || 'total'}
                          onChange={e=>setCfg({ cara_hangus: e.target.value })} style={inp}>
                          <option value="total">Hangus total</option>
                          <option value="proporsional">Dipotong proporsional</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {form.tipe_perhitungan === 'bertingkat' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
                    <div>
                      <label style={lbl}>Tangga Pencapaian (berdasarkan skor KPI bulanan)</label>
                      <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                        {(form.konfigurasi.tangga || []).map((row, i) => (
                          <div key={i} style={{ display:'flex', gap:'0.4rem', alignItems:'center' }}>
                            <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>Skor ≥</span>
                            <input type="number" min={0} max={100} value={row.min ?? ''} placeholder="80"
                              style={{...inp, flex:1}}
                              onChange={e=>{ const t=[...form.konfigurasi.tangga]; t[i]={...t[i],min:e.target.value===''?'':Number(e.target.value)}; setCfg({tangga:t}); }} />
                            <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)', whiteSpace:'nowrap' }}>dapat Rp</span>
                            <input type="number" min={0} step={1000} value={row.nominal ?? ''} placeholder="300000"
                              style={{...inp, flex:1}}
                              onChange={e=>{ const t=[...form.konfigurasi.tangga]; t[i]={...t[i],nominal:e.target.value===''?undefined:Number(e.target.value)}; setCfg({tangga:t}); }} />
                            <button type="button" title="Hapus baris"
                              onClick={()=>setCfg({ tangga: form.konfigurasi.tangga.filter((_,x)=>x!==i) })}
                              style={{ background:'#fee2e2', border:'none', borderRadius:'0.4rem', padding:'0.5rem', cursor:'pointer', color:'#b91c1c' }}>
                              <Trash2 size={13}/>
                            </button>
                          </div>
                        ))}
                      </div>
                      <button type="button"
                        onClick={()=>setCfg({ tangga: [...(form.konfigurasi.tangga||[]), { min:'', nominal:undefined }] })}
                        style={{ marginTop:'0.5rem', background:'rgba(79,70,229,0.1)', border:'none', borderRadius:'0.4rem', padding:'0.4rem 0.75rem', cursor:'pointer', color:'var(--primary)', fontWeight:600, fontSize:'0.8rem', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                        <Plus size={13}/> Tambah tangga
                      </button>
                      <p style={{ margin:'0.4rem 0 0', fontSize:'0.75rem', color:'var(--text-secondary)' }}>
                        Yang dipakai adalah tangga tertinggi yang skornya tercapai.
                      </p>
                    </div>
                    <div>
                      <label style={lbl}>Kalau Skor KPI Belum Diinput</label>
                      <select value={form.konfigurasi.jika_data_kosong || 'nol_dengan_peringatan'}
                        onChange={e=>setCfg({ jika_data_kosong: e.target.value })} style={inp}>
                        <option value="nol_dengan_peringatan">Anggap nol, beri peringatan</option>
                        <option value="lewati">Lewati komponen ini</option>
                        <option value="blokir">Blokir — periode tidak bisa dihitung</option>
                      </select>
                    </div>
                  </div>
                )}

                {form.tipe_perhitungan === 'ambil_kpi' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
                    <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'0.5rem', padding:'0.6rem 0.8rem', fontSize:'0.78rem', color:'#1e40af' }}>
                      Nominal bonus diambil <strong>langsung dari modul KPI</strong> (hasil Tier Bonus: role guru + jumlah TM).
                      Ubah besarannya di menu <strong>KPI → Tier Bonus</strong>, bukan di sini.
                    </div>

                    <label style={{ display:'flex', alignItems:'flex-start', gap:'0.5rem', fontSize:'0.82rem', cursor:'pointer' }}>
                      <input type="checkbox" checked={form.konfigurasi.hanya_jika_layak ?? true}
                        onChange={e=>setCfg({ hanya_jika_layak: e.target.checked })}
                        style={{ accentColor:'var(--primary)', marginTop:'0.15rem' }} />
                      <span>
                        Hanya bayar bila status kelayakan <strong>LAYAK</strong>
                        <span style={{ display:'block', color:'var(--text-secondary)', fontSize:'0.75rem', marginTop:'0.15rem' }}>
                          Kalau penilaian KPI menandai TIDAK LAYAK, bonus dihitung 0.
                        </span>
                      </span>
                    </label>

                    <div>
                      <label style={lbl}>Kalau Penilaian KPI Belum Diinput</label>
                      <select value={form.konfigurasi.jika_data_kosong || 'nol_dengan_peringatan'}
                        onChange={e=>setCfg({ jika_data_kosong: e.target.value })} style={inp}>
                        <option value="nol_dengan_peringatan">Anggap nol, beri peringatan</option>
                        <option value="lewati">Lewati komponen ini</option>
                        <option value="blokir">Blokir — periode tidak bisa dihitung</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Status aktif + penjelasan kalau belum lengkap */}
              <div style={{ border:'1px solid var(--glass-border)', borderRadius:'0.5rem', padding:'0.75rem 0.9rem' }}>
                <label style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.85rem', fontWeight:600, cursor:'pointer' }}>
                  <input type="checkbox" checked={form.aktif} onChange={e=>setForm(f=>({...f,aktif:e.target.checked}))}
                    style={{ accentColor:'var(--primary)' }} />
                  Aktifkan komponen ini
                </label>
                {kurangSekarang.length > 0 ? (
                  <div style={{ marginTop:'0.5rem', fontSize:'0.78rem', color:'#b45309' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.3rem', fontWeight:700 }}>
                      <AlertTriangle size={13}/> Belum bisa diaktifkan:
                    </div>
                    <ul style={{ margin:'0.3rem 0 0 1.1rem', padding:0 }}>
                      {kurangSekarang.map((k,i)=><li key={i}>{k}</li>)}
                    </ul>
                  </div>
                ) : (
                  <div style={{ marginTop:'0.4rem', fontSize:'0.78rem', color:'#047857', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                    <CheckCircle2 size={13}/> Pengaturan sudah lengkap.
                  </div>
                )}
              </div>

              <div style={{ display:'flex', gap:'0.65rem', justifyContent:'flex-end', paddingTop:'0.5rem', borderTop:'1px solid var(--glass-border)' }}>
                <button type="button" className="btn" onClick={()=>setModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Menyimpan...':'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ MODAL UJI COBA HITUNG ══ */}
      {ujiOpen && (
        <div className="modal-overlay" style={{ alignItems:'flex-start', paddingTop:'2rem' }}>
          <div className="modal-content" style={{ maxWidth:620, maxHeight:'88vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <h2 style={{ fontWeight:700, fontSize:'1.1rem', margin:0 }}>Uji Coba Hitung</h2>
              <button onClick={()=>setUjiOpen(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <p style={{ fontSize:'0.82rem', color:'var(--text-secondary)', marginTop:0 }}>
              Melihat hasil perhitungan tanpa menyimpan apa pun. Aman dicoba berkali-kali.
            </p>

            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'0.65rem', marginBottom:'0.85rem' }}>
              <div>
                <label style={lbl}>Karyawan</label>
                <select value={ujiForm.guru_id} onChange={e=>setUjiForm(f=>({...f,guru_id:e.target.value}))} style={inp}>
                  <option value="">— Pilih —</option>
                  {gurus.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Bulan</label>
                <select value={ujiForm.bulan} onChange={e=>setUjiForm(f=>({...f,bulan:Number(e.target.value)}))} style={inp}>
                  {BULAN.slice(1).map((b,i)=><option key={i+1} value={i+1}>{b}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Tahun</label>
                <input type="number" value={ujiForm.tahun} onChange={e=>setUjiForm(f=>({...f,tahun:Number(e.target.value)}))} style={inp} />
              </div>
            </div>

            <button className="btn btn-primary" onClick={jalankanUji} disabled={ujiLoading}
              style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
              <PlayCircle size={15}/> {ujiLoading ? 'Menghitung...' : 'Hitung Sekarang'}
            </button>

            {ujiHasil && (
              <div style={{ marginTop:'1.25rem', borderTop:'1px solid var(--glass-border)', paddingTop:'1rem' }}>
                <SlipGajiPrintable model={dariSimulasi(ujiHasil, ujiMeta || {})} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
