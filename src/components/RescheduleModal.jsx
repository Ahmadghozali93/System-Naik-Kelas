import { useState } from 'react';
import { format, addDays } from 'date-fns';

export default function RescheduleModal({ schedule, onClose, onSubmit }) {
    const [newDate, setNewDate] = useState(schedule.sourceDate);
    const [newTime, setNewTime] = useState(schedule.time);
    const [reason, setReason] = useState('');

    // Generate date options (next 10 days, skip Sunday)
    const dateOptions = [];
    let d = new Date();
    for (let i = 0; dateOptions.length < 10; i++) {
        const targetDate = addDays(d, i);
        if (targetDate.getDay() !== 0) {
            dateOptions.push({
                val: format(targetDate, 'yyyy-MM-dd'),
                label: format(targetDate, 'dd MMM yyyy')
            });
        }
    }

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(newDate, newTime, reason);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">Pengajuan Ganti Hari/Jam</h2>

                <div style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                    <p><strong>Pelajaran:</strong> {schedule.subject}</p>
                    <p><strong>Guru:</strong> {schedule.guru}</p>
                    <p><strong>Siswa:</strong> {schedule.siswa}</p>
                    <p><strong>Jadwal Lama:</strong> {schedule.sourceDate} jam {schedule.time}</p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Tanggal Baru</label>
                        <select
                            value={newDate}
                            onChange={e => setNewDate(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                            required
                        >
                            {dateOptions.map(opt => (
                                <option key={opt.val} value={opt.val}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Jam Baru (Format HH:MM - HH:MM)</label>
                        <input
                            type="text"
                            value={newTime}
                            onChange={e => setNewTime(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)' }}
                            required
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Alasan Pengajuan</label>
                        <textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            rows="3"
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', fontFamily: 'inherit' }}
                            placeholder="Siswa ijin sakit, dll..."
                            required
                        ></textarea>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                        <button type="button" className="btn" style={{ background: '#f3f4f6' }} onClick={onClose}>Batal</button>
                        <button type="submit" className="btn btn-primary">Ajukan Ganti Jadwal</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
