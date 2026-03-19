import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Save, Plus, Trash2, BookOpen, X, FileText, ChevronDown, Download, Calendar, Filter, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const SearchableStudentDropdown = ({ siswas, value, onChange, placeholder = "-- Pilih Anak Didik --" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedSiswa = siswas.find(s => s.id === value);
  const filteredSiswas = siswas.filter(s => 
    s.nama.toLowerCase().includes(search.toLowerCase()) || 
    (s.unit && s.unit.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
       <div
          onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
          style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
       >
          <span style={{ color: selectedSiswa ? 'inherit' : '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
             {selectedSiswa ? selectedSiswa.nama : placeholder}
          </span>
          <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.8rem' }}>▼</span>
       </div>

       {isOpen && (
         <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#ffffff', border: '1px solid var(--glass-border)', borderRadius: '0.5rem', marginTop: '0.25rem', maxHeight: '250px', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 15px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--glass-border)' }}>
              <input
                 type="text"
                 placeholder="Cari nama atau unit..."
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 onClick={(e) => e.stopPropagation()}
                 style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--glass-border)', background: '#f3f4f6', fontSize: '0.85rem', outline: 'none' }}
                 autoFocus
              />
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
               {filteredSiswas.length === 0 ? (
                 <div style={{ padding: '0.75rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>Tidak ditemukan</div>
               ) : (
                 filteredSiswas.map(s => (
                   <div 
                     key={s.id}
                     onClick={() => { onChange(s.id); setIsOpen(false); }}
                     style={{ padding: '0.75rem', borderBottom: '1px solid rgba(0,0,0,0.05)', cursor: 'pointer', fontSize: '0.9rem' }}
                     onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                     onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                   >
                     <div style={{ fontWeight: 500 }}>{s.nama}</div>
                     <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Unit: {s.unit || '-'} | Prog: {s.program || '-'}</div>
                   </div>
                 ))
               )}
            </div>
         </div>
       )}
    </div>
  );
};

export default function JurnalPage() {
  const { user } = useAuth();
  
  // Data Master
  const [gurus, setGurus] = useState([]);
  const [siswas, setSiswas] = useState([]); // Diambil dari aktivasi_siswa
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [guruId, setGuruId] = useState('');
  const [items, setItems] = useState([
    { siswa_id: '', program: '', unit: '', level: '', materi: '', halaman: '', hasil: '', ket: '' }
  ]);
  const [expandedIndex, setExpandedIndex] = useState(0); // Accordion state
  const [isSaving, setIsSaving] = useState(false);

  // Table & Analytics State
  const [jurnals, setJurnals] = useState([]);
  const [isLoadingJurnals, setIsLoadingJurnals] = useState(true);

  // Filter States
  const [filterType, setFilterType] = useState('bulan'); // 'semua', 'bulan', 'custom'
  const [filterBulan, setFilterBulan] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Fetch init master data
  useEffect(() => {
    fetchData();
  }, [user]);

  // Fetch datatable jurnal based on filters
  useEffect(() => {
    if (user) {
      fetchJurnals();
    }
  }, [filterType, filterBulan, filterStartDate, filterEndDate, user]);

  const fetchJurnals = async () => {
    setIsLoadingJurnals(true);
    try {
      let query = supabase
        .from('jurnal_entries')
        .select(`
          id, created_at, timestamp, guru_id, siswa_id, program, unit, level, materi, halaman, hasil, keterangan,
          gurus!inner ( nama ),
          siswa ( nama )
        `);
      
      if (user?.role === 'Guru' && user?.nama) {
        query = query.ilike('gurus.nama', user.nama);
      }
      
      // Menerapkan Filter Tanggal
      if (filterType === 'bulan' && filterBulan) {
        const startDate = `${filterBulan}-01T00:00:00.000Z`;
        const nextMonthDate = new Date(`${filterBulan}-01`);
        nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
        const endDate = nextMonthDate.toISOString();
        
        query = query.gte('created_at', startDate).lt('created_at', endDate);
      } else if (filterType === 'custom' && filterStartDate && filterEndDate) {
        const startDate = new Date(filterStartDate);
        startDate.setHours(0,0,0,0);
        
        const endDate = new Date(filterEndDate);
        endDate.setHours(23,59,59,999);
        
        query = query.gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString());
      }
      
      query = query.order('created_at', { ascending: false });
        
      const { data, error } = await query;
      if (error) throw error;
      setJurnals(data || []);
    } catch (err) {
      console.error('Error fetching jurnals:', err);
    } finally {
      setIsLoadingJurnals(false);
    }
  };

  const fetchData = async () => {
    try {
      // Hanya tarik siswa yang memiliki aktivasi jadwal aktif
      const [guruRes, aktivasiRes] = await Promise.all([
        supabase.from('gurus').select('id, nama').eq('status', 'Aktif').order('nama'),
        supabase.from('aktivasi_siswa')
                .select('siswa_id, nama_siswa, detail_jadwal, siswa ( unit )')
                .eq('status', 'Aktif')
      ]);

      if (guruRes.data) setGurus(guruRes.data);

      if (user?.nama) {
        // Secara otomatis pilih user yang sama dengan akun login jika ada di list
        const matchingGuru = guruRes.data?.find(g => g.nama?.toLowerCase() === user.nama?.toLowerCase());
        if (matchingGuru) {
          setGuruId(matchingGuru.id);
        } else if (guruRes.data?.length > 0 && !guruId) {
          setGuruId(guruRes.data[0].id);
        }
      } else if (guruRes.data?.length > 0 && !guruId) {
        setGuruId(guruRes.data[0].id);
      }

      // Olah data aktivasi siswa agar unik (mencegah duplikat jika 1 anak punya 2 jadwal)
      if (aktivasiRes.data) {
        const uniqueSiswas = {};
        
        aktivasiRes.data.forEach(as => {
          if (!uniqueSiswas[as.siswa_id]) {
            let unitVal = as.siswa?.unit || '';
            let programVal = '';
            
            // Coba ambil dari snapshot detail_jadwal jika tersedia
            if (as.detail_jadwal) {
               if (as.detail_jadwal.unit) unitVal = as.detail_jadwal.unit;
               if (as.detail_jadwal.nama_program) programVal = as.detail_jadwal.nama_program;
            }

            uniqueSiswas[as.siswa_id] = {
              id: as.siswa_id,
              nama: as.nama_siswa,
              unit: unitVal,
              program: programVal
            };
          }
        });
        
        // Urutkan berdasarkan nama
        setSiswas(Object.values(uniqueSiswas).sort((a,b) => a.nama.localeCompare(b.nama)));
      }

    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  const handleAddItem = () => {
    const newIndex = items.length;
    setItems([
      ...items,
      { siswa_id: '', program: '', unit: '', level: '', materi: '', halaman: '', hasil: '', ket: '' }
    ]);
    // Otomatis expand form yang baru ditambahkan
    setExpandedIndex(newIndex);
  };

  const handleRemoveItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
    // Jika current yang didelete adalah yang expanded, buka elemen terakhir
    if (expandedIndex === index) {
      setExpandedIndex((items.length - 2) >= 0 ? (items.length - 2) : 0);
    } else if (expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1);
    }
  };

  const toggleExpand = (index) => {
    // Jika diklik tapi sudah terbuka, tutup. Jika lain, buka.
    setExpandedIndex(expandedIndex === index ? -1 : index);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;

    if (field === 'siswa_id') {
      const selectedSiswa = siswas.find(s => s.id === value);
      if (selectedSiswa) {
        newItems[index].unit = selectedSiswa.unit || '';
        newItems[index].program = selectedSiswa.program || '';
      } else {
        newItems[index].unit = '';
        newItems[index].program = '';
      }
    }

    setItems(newItems);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!guruId) return alert('Pilih Guru terlebih dahulu');
    const validItems = items.filter(i => i.siswa_id);
    if (validItems.length === 0) return alert('Minimal isi 1 data anak didik');

    setIsSaving(true);
    try {
      // Menyiapkan payload untuk di-insert ke Supabase
      const payload = validItems.map(item => ({
        guru_id: guruId,
        siswa_id: item.siswa_id,
        program: item.program,
        unit: item.unit,
        level: item.level,
        materi: item.materi,
        halaman: item.halaman,
        hasil: item.hasil,
        keterangan: item.ket
      }));

      // Insert ke Supabase
      const { error } = await supabase.from('jurnal_entries').insert(payload);

      if (error) {
        if (error.code === '42P01') {
           throw new Error('Tabel jurnal_entries belum ada di Supabase. Silakan Eksekusi file supabase_jurnal.sql terlebih dahulu.');
        }
        throw error;
      }
      
      alert('Yeay! Berhasil menyimpan jurnal ke Database!');

      setItems([{ siswa_id: '', program: '', unit: '', level: '', materi: '', halaman: '', hasil: '', ket: '' }]);
      setExpandedIndex(0);
      setIsModalOpen(false); 

      fetchJurnals();

    } catch (err) {
      console.error(err);
      alert(err.message || 'Gagal menyimpan jurnal ke database.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCSV = () => {
    if (jurnals.length === 0) return alert('Tidak ada data untuk diekspor!');
    
    // Header CSV
    const headers = ['Tanggal', 'Waktu', 'Nama Guru', 'Nama Siswa', 'Program', 'Cabang/Unit', 'Level/Tema', 'Materi', 'Halaman', 'Hasil Evaluasi', 'Keterangan Khusus'];
    
    // Rows
    const rows = jurnals.map(j => {
      const d = new Date(j.created_at);
      return [
        d.toLocaleDateString('id-ID'),
        d.toLocaleTimeString('id-ID'),
        `"${j.gurus?.nama || '-'}"`,
        `"${j.siswa?.nama || '-'}"`,
        `"${j.program || '-'}"`,
        `"${j.unit || '-'}"`,
        `"${j.level || '-'}"`,
        `"${j.materi || '-'}"`,
        `"${j.halaman || '-'}"`,
        `"${j.hasil || '-'}"`,
        `"${(j.keterangan || '').replace(/"/g, '""')}"` // escape double quotes for CSV
      ].join(',');
    });
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Rekap_Jurnal_Mengajar_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkDelete = async () => {
    if (jurnals.length === 0) return alert('Tidak ada data jurnal pada rentang waktu/filter ini untuk dihapus.');
    
    const confirmed = window.confirm(`PERINGATAN BAHAYA!\n\nAnda akan MENGHAPUS SEMUA (${jurnals.length}) data jurnal/rekam mengajar yang sedang tampil di tabel saat ini!\nTindakan ini bersifat permanen dan tidak dapat dibatalkan.\n\nApakah Anda yakin ingin MELANJUTKAN penghapusan massal?`);
    if (!confirmed) return;

    try {
      setIsLoadingJurnals(true);
      const idsToDelete = jurnals.map(j => j.id);
      
      const { error } = await supabase.from('jurnal_entries').delete().in('id', idsToDelete);
      if (error) throw error;
      
      alert(`Berhasil menghapus ${idsToDelete.length} rekam jurnal.`);
      fetchJurnals();
    } catch (err) {
      console.error(err);
      alert('Gagal melakukan penghapusan massal.');
      setIsLoadingJurnals(false);
    }
  };

  // Analytics Calculation
  // 1. Total murid diinput
  const totalSiswaDiinput = jurnals.length;
  // 2. Breakdown per Program
  const programCounts = jurnals.reduce((acc, curr) => {
    const prog = curr.program || 'Tanpa Program';
    acc[prog] = (acc[prog] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page-container">
      {/* Header Halaman Utama */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen className="w-6 h-6 text-primary" />
            Jurnal Mengajar
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Riwayat pencatatan jurnal harian tutor.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Tambah Jurnal</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
         {/* Total Seluruhnya */}
         <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(79,70,229,0.1)', flexShrink: 0 }}>
               <Users size={26} style={{ color: '#4f46e5' }} />
            </div>
            <div>
               <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#4f46e5', lineHeight: 1.1 }}>
                  {totalSiswaDiinput}
               </div>
               <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, marginTop: '0.15rem' }}>
                  Total Input Jurnal
               </div>
            </div>
         </div>

         {/* Breakdown per Program */}
         {Object.entries(programCounts).map(([prog, count], idx) => {
            const colors = ['#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#0891b2', '#ef4444'];
            const color = colors[idx % colors.length];
            // konversi hex ke rgba khusus untuk background icon
            const hexToRgba = (hex, alpha) => {
               const r = parseInt(hex.slice(1, 3), 16);
               const g = parseInt(hex.slice(3, 5), 16);
               const b = parseInt(hex.slice(5, 7), 16);
               return `rgba(${r},${g},${b},${alpha})`;
            };

            return (
               <div key={prog} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexToRgba(color, 0.1), flexShrink: 0 }}>
                     <BookOpen size={26} style={{ color }} />
                  </div>
                  <div>
                     <div style={{ fontSize: '1.75rem', fontWeight: 700, color, lineHeight: 1.1 }}>
                        {count}
                     </div>
                     <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, marginTop: '0.15rem' }}>
                        Program {prog}
                     </div>
                  </div>
               </div>
            );
         })}
      </div>

      {/* Filter & Controls Panel */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
         
         <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                <Filter className="w-4 h-4" /> Filter Waktu:
            </div>
            <select
               value={filterType}
               onChange={(e) => setFilterType(e.target.value)}
               className="form-input"
               style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', minWidth: '130px' }}
            >
               <option value="bulan">Per Bulan</option>
               <option value="custom">Custom Tanggal</option>
               <option value="semua">Semua Waktu</option>
            </select>
            
            {filterType === 'bulan' && (
               <input
                 type="month"
                 value={filterBulan}
                 onChange={(e) => setFilterBulan(e.target.value)}
                 className="form-input"
                 style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
               />
            )}

            {filterType === 'custom' && (
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="form-input"
                    style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                  />
                  <span>s/d</span>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="form-input"
                    style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                  />
               </div>
            )}
         </div>

         {user?.role === 'Admin' && (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
               <button onClick={handleExportCSV} className="btn" style={{ background: '#10b981', color: 'white', border: 'none' }} title="Eksport list yang tampil ke file CSV / Excel">
                 <Download className="w-4 h-4" /> Ekspor Data (CSV)
               </button>
               <button onClick={handleBulkDelete} className="btn" style={{ background: '#ef4444', color: 'white', border: 'none' }} title="Hapus massal berdasarkan filter aktu">
                 <Trash2 className="w-4 h-4" /> Mass Delete
               </button>
            </div>
         )}
      </div>

      {/* Konten Utama (Tabel Jurnal Mengajar) */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '1000px', textAlign: 'left', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.875rem' }}>
                <thead>
                    <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.05)' }}>
                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Tanggal & Waktu</th>
                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Nama Guru</th>
                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Siswa & Program</th>
                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Materi / Topik</th>
                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Hal / Eval</th>
                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Keterangan</th>
                        <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    {isLoadingJurnals ? (
                        <tr>
                            <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                Memuat data jurnal...
                            </td>
                        </tr>
                    ) : jurnals.length === 0 ? (
                        <tr>
                            <td colSpan="7" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                                <FileText className="w-12 h-12 text-primary" style={{ margin: '0 auto', opacity: 0.3, marginBottom: '1rem' }} />
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: '0.25rem' }}>Tidak Ada Pencarian Jurnal</h3>
                                <p style={{ color: 'var(--text-secondary)' }}>Tidak ditemukan riwayat mengajar pada rentang waktu ini.</p>
                            </td>
                        </tr>
                    ) : (
                        jurnals.map((jurnal) => {
                            const dateObj = new Date(jurnal.created_at);
                            const tglFormated = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                            const timeFormated = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                            
                            return (
                                <tr key={jurnal.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(79,70,229,0.02)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontWeight: 600 }}>{tglFormated}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>pukul {timeFormated}</div>
                                    </td>
                                    <td style={{ padding: '1rem', fontWeight: 500 }}>
                                        {jurnal.gurus?.nama || '-'}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--primary)' }}>{jurnal.siswa?.nama || '-'}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{jurnal.program || '-'} | {jurnal.unit || '-'}</div>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontWeight: 500 }}>{jurnal.level || '-'}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{jurnal.materi || '-'}</div>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div><strong>Hal:</strong> {jurnal.halaman || '-'}</div>
                                        <div style={{ fontSize: '0.8rem' }}>
                                            Hasil: <span style={{ fontWeight: 600, color: jurnal.hasil === 'Lanjut' ? '#16a34a' : jurnal.hasil === 'Ulang' ? '#dc2626' : 'var(--text-primary)' }}>{jurnal.hasil || '-'}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '200px' }}>
                                        {jurnal.keterangan || '-'}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <button
                                            onClick={async () => {
                                                if (window.confirm('Yakin ingin menghapus entri jurnal ini?')) {
                                                    const { error } = await supabase.from('jurnal_entries').delete().eq('id', jurnal.id);
                                                    if (!error) fetchJurnals();
                                                }
                                            }}
                                            style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            title="Hapus Jurnal Secara Normal"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {/* Modal Form Jurnal (Satu Kolom - Accordion Style) */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ overflowY: 'auto', padding: '2rem 0' }}>
          <div className="modal-content" style={{ maxWidth: '600px', margin: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="text-xl font-bold">Tambah Jurnal Mengajar</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Info Dasar Jurnal */}
              <div>
                <h3 className="font-semibold text-lg border-b pb-2 mb-3">Informasi Umum</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nama Guru</label>
                    <select
                      className="form-input"
                      value={guruId}
                      onChange={(e) => setGuruId(e.target.value)}
                      disabled={user?.role === 'Guru'}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                      required
                    >
                      <option value="">-- Pilih Guru --</option>
                      {gurus.map(g => (
                        <option key={g.id} value={g.id}>{g.nama}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Data Murid (Accordion / Toggle List) */}
              <div>
                <h3 className="font-semibold text-lg border-b pb-2 mb-3">Data Siswa</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {items.map((item, index) => {
                    const isExpanded = expandedIndex === index;
                    const selectedName = siswas.find(s => s.id === item.siswa_id)?.nama || 'Belum dipilih';

                    return (
                      <div key={index} style={{ border: '1px solid var(--glass-border)', borderRadius: '0.5rem', background: 'var(--surface-color)', overflow: 'hidden' }}>
                        
                        {/* Header Accordion (Bisa di-klik untuk membuka/menutup) */}
                        <div 
                          onClick={() => toggleExpand(index)}
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            padding: '1rem', 
                            cursor: 'pointer', 
                            background: isExpanded ? 'rgba(79, 70, 229, 0.03)' : 'transparent',
                            borderBottom: isExpanded ? '1px dashed var(--glass-border)' : 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                            <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {index + 1}. {selectedName}
                            </span>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleRemoveItem(index); }}
                              style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: 'none', cursor: 'pointer', padding: '0.35rem 0.75rem', borderRadius: '0.375rem', opacity: items.length > 1 ? 1 : 0.5, fontSize: '0.8rem', fontWeight: 500 }}
                              disabled={items.length <= 1}
                            >
                              Hapus
                            </button>
                            <ChevronDown 
                              className="w-5 h-5 text-secondary" 
                              style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} 
                            />
                          </div>
                        </div>

                        {/* Isi Formulir Accordion (Membuka / Menutup) */}
                        {isExpanded && (
                          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Nama Siswa</label>
                              <SearchableStudentDropdown 
                                siswas={siswas}
                                value={item.siswa_id}
                                onChange={(val) => handleItemChange(index, 'siswa_id', val)}
                              />
                            </div>
                            
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Program (Otomatis)</label>
                              <input type="text" className="form-input" value={item.program} readOnly placeholder="Terisi Otomatis" style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: '#f3f4f6', color: 'var(--text-secondary)' }} />
                            </div>
                            
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Unit / Cabang (Otomatis)</label>
                              <input type="text" className="form-input" value={item.unit} readOnly placeholder="Terisi Otomatis" style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: '#f3f4f6', color: 'var(--text-secondary)' }} />
                            </div>
                            
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Level / Tema / Bab</label>
                              <input type="text" className="form-input" value={item.level} onChange={(e) => handleItemChange(index, 'level', e.target.value)} placeholder="Mis: Jilid 1 / Tema 2" style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }} />
                            </div>
                            
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Pb / Hafalan / Materi</label>
                              <input type="text" className="form-input" value={item.materi} onChange={(e) => handleItemChange(index, 'materi', e.target.value)} placeholder="Mis: Pb 1 / An-Naba" style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }} />
                            </div>
                            
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Halaman</label>
                              <input type="text" className="form-input" value={item.halaman} onChange={(e) => handleItemChange(index, 'halaman', e.target.value)} placeholder="Hal. X" style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }} />
                            </div>
                            
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Evaluasi (Hasil)</label>
                              <select className="form-input" value={item.hasil} onChange={(e) => handleItemChange(index, 'hasil', e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}>
                                <option value="">- Pilih Hasil -</option>
                                <option value="Lanjut">Lanjut</option>
                                <option value="Ulang">Ulang</option>
                              </select>
                            </div>
                            
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>Keterangan Khusus</label>
                              <textarea className="form-input" value={item.ket} onChange={(e) => handleItemChange(index, 'ket', e.target.value)} placeholder="Catatan opsional..." rows="2" style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit' }}></textarea>
                            </div>
                          </div>
                        )}
                        
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={handleAddItem}
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px dashed var(--glass-border)', padding: '0.75rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 500, marginTop: '0.5rem' }}
                  >
                    <Plus className="w-5 h-5" />
                    Tambah Kolom Murid Baru
                  </button>

                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" className="btn" style={{ background: '#f3f4f6' }} onClick={() => setIsModalOpen(false)}>
                  Tutup
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? 'Menyimpan...' : 'Simpan Jurnal'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
