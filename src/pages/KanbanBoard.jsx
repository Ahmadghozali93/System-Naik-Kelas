import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { id } from 'date-fns/locale';
import { Calendar, Filter, Clock, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Generate next 10 days
const generateDates = () => {
    const dates = [];
    for (let i = 0; i < 10; i++) {
        const date = addDays(new Date(), i);
        dates.push(date);
    }
    return dates;
};

export default function KanbanBoard() {
    const [aktivasis, setAktivasis] = useState([]);
    const [jadwalMaster, setJadwalMaster] = useState([]);
    const [reschedules, setReschedules] = useState([]);
    const [masterJam, setMasterJam] = useState([]);
    const [units, setUnits] = useState([]);
    const [programs, setPrograms] = useState([]);
    const [gurus, setGurus] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [filterUnit, setFilterUnit] = useState('');
    const [filterProgram, setFilterProgram] = useState('');
    const [filterGuru, setFilterGuru] = useState('');
    const [filterSlot, setFilterSlot] = useState('');

    const dates = generateDates();

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [aktivasiRes, jadwalRes, rescheduleRes, jamRes, unitRes, programRes, guruRes] = await Promise.all([
                supabase.from('aktivasi_siswa').select('*').in('status', ['Aktif']),
                supabase.from('jadwal_master').select('*'),
                supabase.from('reschedules').select('*').in('status', ['Pending', 'Approved', 'Done']),
                supabase.from('master_jam').select('*').order('waktu', { ascending: true }),
                supabase.from('units').select('nama').eq('aktif', true),
                supabase.from('programs').select('id, nama').eq('status', 'Aktif'),
                supabase.from('gurus').select('id, nama').eq('role', 'Guru')
            ]);

            if (aktivasiRes.error) throw aktivasiRes.error;
            if (jadwalRes.error) throw jadwalRes.error;
            if (rescheduleRes.error) throw rescheduleRes.error;
            if (jamRes.error) throw jamRes.error;
            if (unitRes.error) throw unitRes.error;
            if (programRes.error) throw programRes.error;
            if (guruRes.error) throw guruRes.error;

            setAktivasis(aktivasiRes.data || []);
            setJadwalMaster(jadwalRes.data || []);
            setReschedules(rescheduleRes.data || []);
            setMasterJam(jamRes.data || []);
            setUnits(unitRes.data || []);
            setPrograms(programRes.data || []);
            setGurus(guruRes.data || []);
        } catch (error) {
            console.error('Error fetching data:', error.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Helper: Map day name to Indonesian
    const getDayName = (date) => format(date, 'EEEE', { locale: id });

    // Function to check if an aktivasi belongs in a specific cell
    const getSchedulesForCell = (date, waktuJam) => {
        const dayName = getDayName(date); // e.g., 'Senin'
        const dateStr = format(date, 'yyyy-MM-dd');

        return aktivasis.filter(a => {
            const d = a.detail_jadwal || {};

            // Apply Filters
            if (filterUnit && d.unit !== filterUnit) return false;
            if (filterProgram && d.program_id !== filterProgram) return false;
            if (filterGuru && d.guru_id !== filterGuru) return false;

            // Apply Search
            if (search) {
                const s = search.toLowerCase();
                const matchSiswa = a.nama_siswa?.toLowerCase().includes(s);
                const matchProgram = d.nama_program?.toLowerCase().includes(s);
                const matchGuru = d.nama_guru?.toLowerCase().includes(s);
                if (!matchSiswa && !matchProgram && !matchGuru) return false;
            }

            // Rutin: match day name AND jam
            if (d.jenis_program === 'Rutin') {
                const jamMatch = d.jam === waktuJam;
                const isDayMatch = d.hari && d.hari.includes(dayName);
                return jamMatch && isDayMatch;
            }
            // Harian: match exact date (tgl_mulai) and jam_pertemuan
            if (d.jenis_program === 'Harian') {
                const dateMatch = a.tgl_mulai === dateStr;
                const jamMatch = d.jam_pertemuan === waktuJam;
                return dateMatch && jamMatch;
            }

            return false;
        });
    };

    // Get reschedules that land on this cell (target jadwal + target date)
    const getReschedulesForCell = (date, waktuJam) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return reschedules.filter(r => {
            if (r.tanggal_tujuan !== dateStr) return false;
            if (r.jam_tujuan !== waktuJam) return false;
            const tj = jadwalMaster.find(j => j.id === r.jadwal_tujuan_id);
            if (!tj) return false;
            if (filterUnit && tj.unit !== filterUnit) return false;
            if (filterProgram && tj.program_id !== filterProgram) return false;
            if (filterGuru && tj.guru_id !== filterGuru) return false;
            // Apply Search
            if (search) {
                const s = search.toLowerCase();
                const matchSiswa = r.nama_siswa?.toLowerCase().includes(s);
                const matchProgram = tj.nama_program?.toLowerCase().includes(s);
                const matchGuru = tj.nama_guru?.toLowerCase().includes(s);
                if (!matchSiswa && !matchProgram && !matchGuru) return false;
            }
            return true;
        });
    };

    // Get reschedule-out entries: students moved AWAY from this cell on this date
    const getRescheduleOutForCell = (date, waktuJam) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return reschedules.filter(r => {
            if (r.tanggal_asal !== dateStr) return false;
            // Match original jadwal's jam
            const akt = aktivasis.find(a => a.id === r.aktivasi_id);
            if (!akt) return false;
            const dj = akt.detail_jadwal || {};
            if (dj.jam !== waktuJam) return false;
            if (filterUnit && dj.unit !== filterUnit) return false;
            if (filterProgram && dj.program_id !== filterProgram) return false;
            if (filterGuru && dj.guru_id !== filterGuru) return false;
            return true;
        });
    };

    // Get jadwal_master slots with remaining quota for a cell
    const getAvailableJadwalsForCell = (date, waktuJam) => {
        const dayName = getDayName(date);
        const dateStr = format(date, 'yyyy-MM-dd');

        return jadwalMaster
            .filter(j => {
                if (filterUnit && j.unit !== filterUnit) return false;
                if (filterProgram && j.program_id !== filterProgram) return false;
                if (filterGuru && j.guru_id !== filterGuru) return false;
                if (j.jam !== waktuJam) return false;
                if (!j.hari || !j.hari.includes(dayName)) return false;
                // Apply Search
                if (search) {
                    const s = search.toLowerCase();
                    const matchProgram = j.nama_program?.toLowerCase().includes(s);
                    const matchGuru = j.nama_guru?.toLowerCase().includes(s);
                    if (!matchProgram && !matchGuru) return false;
                }
                return true;
            })
            .map(j => {
                const activeCount = aktivasis.filter(a => a.jadwal_id === j.id && a.status === 'Aktif').length;
                const rescheduleCount = reschedules.filter(r => r.jadwal_tujuan_id === j.id && r.tanggal_tujuan === dateStr && (r.status === 'Pending' || r.status === 'Approved')).length;
                const sisaKuota = (j.kuota || 0) - activeCount - rescheduleCount;
                return { ...j, sisaKuota, terisi: activeCount };
            })
            .filter(j => j.sisaKuota > 0);
    };

    return (
        <div className="page-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="page-header" style={{ marginBottom: '1rem' }}>
                <h1 className="page-title">Timetable Master (10 Hari)</h1>
                <p className="text-secondary">Lihat jadwal kelas berdasarkan hari dan jam.</p>
            </div>

            {/* Search & Filters */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
                {/* Search */}
                <div style={{ position: 'relative', minWidth: '220px', flex: '1', maxWidth: '320px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input
                        type="text"
                        placeholder="Cari siswa / guru / program..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2.25rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', outline: 'none' }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Filter size={16} style={{ color: 'var(--text-secondary)' }} />
                </div>

                <select
                    value={filterUnit}
                    onChange={(e) => setFilterUnit(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '130px' }}
                >
                    <option value="">Semua Unit</option>
                    {units.map(u => (
                        <option key={u.nama} value={u.nama}>{u.nama}</option>
                    ))}
                </select>

                <select
                    value={filterProgram}
                    onChange={(e) => setFilterProgram(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '130px' }}
                >
                    <option value="">Semua Program</option>
                    {programs.map(p => (
                        <option key={p.id} value={p.id}>{p.nama}</option>
                    ))}
                </select>

                <select
                    value={filterGuru}
                    onChange={(e) => setFilterGuru(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '130px' }}
                >
                    <option value="">Semua Guru</option>
                    {gurus.map(g => (
                        <option key={g.id} value={g.id}>{g.nama}</option>
                    ))}
                </select>

                <select
                    value={filterSlot}
                    onChange={(e) => setFilterSlot(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontSize: '0.85rem', minWidth: '130px' }}
                >
                    <option value="">Semua Slot</option>
                    <option value="terisi">Terisi</option>
                    <option value="kosong">Kosong</option>
                </select>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--surface-color)', borderRadius: '1rem', border: '1px solid var(--glass-border)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                {isLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>Memuat jadwal...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-color)', zIndex: 10 }}>
                            <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                                <th style={{ padding: '1rem', textAlign: 'center', borderRight: '1px solid var(--glass-border)', width: '140px', minWidth: '140px', backgroundColor: '#f9fafb', position: 'sticky', left: 0, zIndex: 11 }}>
                                    <Clock className="w-5 h-5 mx-auto text-gray-400" />
                                </th>
                                {dates.map((date, idx) => (
                                    <th key={idx} style={{ padding: '1rem', textAlign: 'center', borderRight: '1px solid var(--glass-border)', minWidth: '150px' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{format(date, 'EEEE', { locale: id })}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{format(date, 'dd MMM yyyy', { locale: id })}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {masterJam.length === 0 ? (
                                <tr>
                                    <td colSpan={11} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Belum ada Master Jam diatur.</td>
                                </tr>
                            ) : (
                                masterJam.map((jam, jamIdx) => (
                                    <tr key={jam.id} style={{ borderBottom: '2px solid #e2e8f0', backgroundColor: jamIdx % 2 === 0 ? '#ffffff' : '#eef2ff' }}>
                                        {/* Row Header: Time */}
                                        <td style={{ padding: '1rem', textAlign: 'center', borderRight: '2px solid #e2e8f0', fontWeight: 600, color: 'var(--text-secondary)', backgroundColor: '#f9fafb', fontSize: '0.875rem', whiteSpace: 'nowrap', width: '140px', minWidth: '140px', position: 'sticky', left: 0, zIndex: 5 }}>
                                            {jam.waktu}
                                        </td>

                                        {/* Data Cells */}
                                        {dates.map((date, idx) => {
                                            const cellSchedules = getSchedulesForCell(date, jam.waktu);
                                            const emptyJadwals = getAvailableJadwalsForCell(date, jam.waktu);
                                            const rescheduleIn = getReschedulesForCell(date, jam.waktu);
                                            const rescheduleOut = getRescheduleOutForCell(date, jam.waktu);
                                            const rescheduleOutSiswaIds = new Set(rescheduleOut.map(r => {
                                                const akt = aktivasis.find(a => a.id === r.aktivasi_id);
                                                return akt?.nama_siswa;
                                            }));

                                            const showTerisi = filterSlot !== 'kosong';
                                            const showKosong = filterSlot !== 'terisi';

                                            return (
                                                <td key={idx} style={{ padding: '0.35rem', borderRight: '1px solid var(--glass-border)', verticalAlign: 'top' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                        {/* Terisi */}
                                                        {showTerisi && cellSchedules.map(sch => {
                                                            const d = sch.detail_jadwal || {};
                                                            const isHarian = d.jenis_program === 'Harian';
                                                            const isOut = rescheduleOutSiswaIds.has(sch.nama_siswa);
                                                            return (
                                                                <div key={sch.id} style={{
                                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.7rem',
                                                                    background: isOut ? '#fef2f2' : isHarian ? '#fffbeb' : '#eef2ff',
                                                                    color: isOut ? '#dc2626' : isHarian ? '#b45309' : '#4338ca',
                                                                    opacity: isOut ? 0.55 : 1,
                                                                    textDecoration: isOut ? 'line-through' : 'none',
                                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                                                }}>
                                                                    <span style={{ fontWeight: 600 }}>{sch.nama_siswa}</span>
                                                                    <span style={{ opacity: 0.4 }}>·</span>
                                                                    <span style={{ opacity: 0.7 }}>{d.nama_program}</span>
                                                                    <span style={{ opacity: 0.4 }}>·</span>
                                                                    <span style={{ opacity: 0.7 }}>{d.nama_guru}</span>
                                                                    {isOut && <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.6rem', textDecoration: 'none', marginLeft: 'auto' }}>→</span>}
                                                                </div>
                                                            );
                                                        })}
                                                        {/* Reschedule masuk */}
                                                        {showTerisi && rescheduleIn.map(r => {
                                                            const tj = jadwalMaster.find(j => j.id === r.jadwal_tujuan_id);
                                                            return (
                                                                <div key={'resc-' + r.id} style={{
                                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.7rem',
                                                                    background: '#ecfdf5',
                                                                    color: '#047857',
                                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                                                }}>
                                                                    <span style={{ fontWeight: 700, fontSize: '0.6rem' }}>←</span>
                                                                    <span style={{ fontWeight: 600 }}>{r.nama_siswa}</span>
                                                                    <span style={{ opacity: 0.4 }}>·</span>
                                                                    <span style={{ opacity: 0.7 }}>{tj?.nama_program || '-'}</span>
                                                                </div>
                                                            );
                                                        })}
                                                        {/* Kosong */}
                                                        {showKosong && emptyJadwals.map(j => (
                                                            <div key={'empty-' + j.id} style={{
                                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                                padding: '4px 8px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.65rem',
                                                                background: '#f9fafb',
                                                                color: '#9ca3af',
                                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                                            }}>
                                                                <span style={{ fontWeight: 500 }}>{j.nama_program}</span>
                                                                <span style={{ opacity: 0.4 }}>·</span>
                                                                <span>{j.nama_guru}</span>
                                                                <span style={{ marginLeft: 'auto', fontWeight: 600 }}>({j.sisaKuota})</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
