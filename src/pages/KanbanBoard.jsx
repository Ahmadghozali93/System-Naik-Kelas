import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { id } from 'date-fns/locale';
import { Calendar, Filter, Clock } from 'lucide-react';
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
            <div className="page-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 className="page-title">Timetable Master (10 Hari)</h1>
                    <p className="text-secondary">Lihat jadwal kelas berdasarkan hari dan jam.</p>
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-color)', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)' }}>
                        <Filter className="w-4 h-4" style={{ marginRight: '0.5rem', color: 'var(--text-secondary)' }} />
                        <select
                            value={filterUnit}
                            onChange={(e) => setFilterUnit(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.875rem' }}
                        >
                            <option value="">Semua Unit</option>
                            {units.map(u => (
                                <option key={u.nama} value={u.nama}>{u.nama}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-color)', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)' }}>
                        <Filter className="w-4 h-4" style={{ marginRight: '0.5rem', color: 'var(--text-secondary)' }} />
                        <select
                            value={filterProgram}
                            onChange={(e) => setFilterProgram(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.875rem' }}
                        >
                            <option value="">Semua Program</option>
                            {programs.map(p => (
                                <option key={p.id} value={p.id}>{p.nama}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-color)', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)' }}>
                        <Filter className="w-4 h-4" style={{ marginRight: '0.5rem', color: 'var(--text-secondary)' }} />
                        <select
                            value={filterGuru}
                            onChange={(e) => setFilterGuru(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.875rem' }}
                        >
                            <option value="">Semua Guru</option>
                            {gurus.map(g => (
                                <option key={g.id} value={g.id}>{g.nama}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-color)', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)' }}>
                        <Filter className="w-4 h-4" style={{ marginRight: '0.5rem', color: 'var(--text-secondary)' }} />
                        <select
                            value={filterSlot}
                            onChange={(e) => setFilterSlot(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.875rem' }}
                        >
                            <option value="">Semua Slot</option>
                            <option value="terisi">Terisi</option>
                            <option value="kosong">Kosong</option>
                        </select>
                    </div>
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--surface-color)', borderRadius: '1rem', border: '1px solid var(--glass-border)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                {isLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>Memuat jadwal...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-color)', zIndex: 10 }}>
                            <tr style={{ borderBottom: '2px solid var(--glass-border)' }}>
                                <th style={{ padding: '1rem', textAlign: 'center', borderRight: '1px solid var(--glass-border)', width: '140px', minWidth: '140px', backgroundColor: '#f9fafb' }}>
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
                                masterJam.map((jam) => (
                                    <tr key={jam.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                        {/* Row Header: Time */}
                                        <td style={{ padding: '1rem', textAlign: 'center', borderRight: '1px solid var(--glass-border)', fontWeight: 600, color: 'var(--text-secondary)', backgroundColor: '#f9fafb', fontSize: '0.875rem', whiteSpace: 'nowrap', width: '140px', minWidth: '140px' }}>
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
                                                <td key={idx} style={{ padding: '0.5rem', borderRight: '1px solid var(--glass-border)', verticalAlign: 'top' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        {/* Terisi cards */}
                                                        {showTerisi && cellSchedules.map(sch => {
                                                            const d = sch.detail_jadwal || {};
                                                            const isHarian = d.jenis_program === 'Harian';
                                                            const isRescheduledOut = rescheduleOutSiswaIds.has(sch.nama_siswa);
                                                            return (
                                                                <div key={sch.id} style={{
                                                                    background: isRescheduledOut ? 'rgba(239,68,68,0.06)' : isHarian ? 'rgba(245, 158, 11, 0.08)' : 'rgba(79, 70, 229, 0.05)',
                                                                    borderLeft: isRescheduledOut ? '3px solid #f87171' : isHarian ? '3px solid #f59e0b' : '3px solid var(--primary)',
                                                                    padding: '0.6rem',
                                                                    borderRadius: '0.375rem',
                                                                    fontSize: '0.75rem',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: '0.2rem',
                                                                    opacity: isRescheduledOut ? 0.5 : 1,
                                                                    textDecoration: isRescheduledOut ? 'line-through' : 'none'
                                                                }}>
                                                                    <div style={{ fontWeight: 600, color: isRescheduledOut ? '#ef4444' : 'var(--text-primary)' }}>
                                                                        {sch.nama_siswa} <span style={{ fontWeight: 400, opacity: 0.5 }}>|</span> {d.nama_program}
                                                                    </div>
                                                                    <div style={{ color: 'var(--text-secondary)' }}>
                                                                        Guru : {d.nama_guru}
                                                                    </div>
                                                                    {isRescheduledOut && (
                                                                        <div style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.65rem', textDecoration: 'none' }}>Reschedule →</div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                        {/* Reschedule masuk cards */}
                                                        {showTerisi && rescheduleIn.map(r => {
                                                            const tj = jadwalMaster.find(j => j.id === r.jadwal_tujuan_id);
                                                            return (
                                                                <div key={'resc-' + r.id} style={{
                                                                    background: 'rgba(16,185,129,0.08)',
                                                                    borderLeft: '3px solid #10b981',
                                                                    padding: '0.6rem',
                                                                    borderRadius: '0.375rem',
                                                                    fontSize: '0.75rem',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: '0.2rem'
                                                                }}>
                                                                    <div style={{ fontWeight: 600, color: '#047857' }}>
                                                                        {r.nama_siswa} <span style={{ fontWeight: 400, opacity: 0.5 }}>|</span> {tj?.nama_program || '-'}
                                                                    </div>
                                                                    <div style={{ color: 'var(--text-secondary)' }}>
                                                                        Guru : {tj?.nama_guru || '-'}
                                                                    </div>
                                                                    <div style={{ color: '#10b981', fontWeight: 600, fontSize: '0.65rem' }}>← Reschedule ({r.status})</div>
                                                                </div>
                                                            );
                                                        })}
                                                        {/* Kosong cards */}
                                                        {showKosong && emptyJadwals.map(j => (
                                                            <div key={'empty-' + j.id} style={{
                                                                background: 'rgba(156, 163, 175, 0.08)',
                                                                borderLeft: '3px solid #d1d5db',
                                                                padding: '0.6rem',
                                                                borderRadius: '0.375rem',
                                                                fontSize: '0.75rem',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '0.2rem',
                                                                opacity: 0.6
                                                            }}>
                                                                <div style={{ fontWeight: 600, color: '#9ca3af' }}>Kosong <span style={{ fontWeight: 400, fontSize: '0.65rem' }}>(Sisa: {j.sisaKuota})</span></div>
                                                                <div style={{ color: '#9ca3af', fontSize: '0.7rem' }}>
                                                                    {j.nama_program} — {j.nama_guru}
                                                                </div>
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
