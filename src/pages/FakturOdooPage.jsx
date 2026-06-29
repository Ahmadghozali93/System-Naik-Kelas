import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, FileSpreadsheet, Settings, Send, CheckCircle,
  AlertCircle, Clock, RefreshCw, ChevronDown, ChevronUp, Eye, EyeOff
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRupiah } from '../utils/formatRupiah';
import {
  loadOdooSettings, saveOdooSettings, testConnection,
  getOrCreatePartner, findProduct, createInvoice, getInvoiceStatus,
  UNIT_COMPANY,
} from '../lib/odooApi';

const PER_PAGE = 50;
const fmt = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const STATUS_ODOO = {
  not_paid:   { label: 'Belum Lunas',  color: '#d97706', bg: '#fef3c7' },
  in_payment: { label: 'Dalam Proses', color: '#2563eb', bg: '#dbeafe' },
  paid:       { label: 'Lunas',        color: '#047857', bg: '#d1fae5' },
  partial:    { label: 'Sebagian',     color: '#7c3aed', bg: '#ede9fe' },
  error:      { label: 'Error',        color: '#b91c1c', bg: '#fee2e2' },
};

const OdooBadge = ({ row }) => {
  if (!row.odoo_invoice_id && row.odoo_status !== 'error') {
    return <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>—</span>;
  }
  const key = row.odoo_status || 'not_paid';
  const s   = STATUS_ODOO[key] || STATUS_ODOO.not_paid;
  return (
    <span style={{ background: s.bg, color: s.color, padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
};

const inp = {
  padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
  border: '1px solid var(--glass-border)', background: 'var(--surface-color)',
  fontFamily: 'inherit', fontSize: '0.85rem',
};

export default function FakturOdooPage() {
  const [transaksis, setTransaksis]       = useState([]);
  const [rekonsiliasis, setRekonsiliasis] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [page, setPage]                   = useState(1);
  const [selected, setSelected]           = useState(new Set());
  const [sending, setSending]             = useState(new Set());

  // Filter
  const [search, setSearch]               = useState('');
  const [filterUnit, setFilterUnit]       = useState('');
  const [filterProg, setFilterProg]       = useState('');
  const [filterMetode, setFilterMetode]   = useState('');
  const [filterOdoo, setFilterOdoo]       = useState('');
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');

  // Settings panel
  const [showSettings, setShowSettings]   = useState(false);
  const [apiKey, setApiKey]               = useState('');
  const [email, setEmail]                 = useState('');
  const [showKey, setShowKey]             = useState(false);
  const [testMsg, setTestMsg]             = useState(null);
  const [testLoading, setTestLoading]     = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, rRes, settings] = await Promise.all([
        supabase.from('pembayaran_spp').select('*').eq('status', 'Terverifikasi').order('tanggal_bayar', { ascending: false }),
        supabase.from('rekonsiliasi_spp').select('*').order('tanggal', { ascending: false }),
        loadOdooSettings(supabase),
      ]);
      setTransaksis(pRes.data || []);
      setRekonsiliasis(rRes.data || []);
      if (settings.odoo_api_key) setApiKey(settings.odoo_api_key);
      if (settings.odoo_email)   setEmail(settings.odoo_email);
    } catch (e) {
      console.error('FakturOdoo fetchAll error:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const allUnits    = useMemo(() => [...new Set(transaksis.map(p => p.unit).filter(Boolean))].sort(), [transaksis]);
  const allPrograms = useMemo(() => [...new Set(transaksis.map(p => p.nama_program).filter(Boolean))].sort(), [transaksis]);

  const filtered = useMemo(() => transaksis.filter(p => {
    const q   = search.toLowerCase();
    const tgl = p.tanggal_bayar || p.created_at?.split('T')[0];
    if (search       && !p.nama_siswa?.toLowerCase().includes(q) && !p.nama_program?.toLowerCase().includes(q)) return false;
    if (filterUnit   && p.unit         !== filterUnit)   return false;
    if (filterProg   && p.nama_program !== filterProg)   return false;
    if (filterMetode && p.metode       !== filterMetode) return false;
    if (dateFrom     && tgl < dateFrom) return false;
    if (dateTo       && tgl > dateTo)   return false;
    if (filterOdoo === 'belum' && p.odoo_invoice_id)               return false;
    if (filterOdoo === 'sudah' && !p.odoo_invoice_id)              return false;
    if (filterOdoo === 'error' && p.odoo_status !== 'error')       return false;
    return true;
  }), [transaksis, search, filterUnit, filterProg, filterMetode, filterOdoo, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const pageData   = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const resetFilter = () => {
    setSearch(''); setFilterUnit(''); setFilterProg(''); setFilterMetode('');
    setFilterOdoo(''); setDateFrom(''); setDateTo(''); setPage(1);
  };
  const hasFilter = search || filterUnit || filterProg || filterMetode || filterOdoo || dateFrom || dateTo;

  // ─── Settings ───────────────────────────────────────────────────────────────

  const handleSaveSettings = async () => {
    if (!apiKey) return alert('API Key wajib diisi.');
    setSavingSettings(true);
    try {
      await saveOdooSettings(supabase, { apiKey, email });
      alert('Pengaturan Odoo berhasil disimpan.');
    } catch (e) {
      alert('Gagal simpan: ' + e.message);
    }
    setSavingSettings(false);
  };

  const handleTestConnection = async () => {
    if (!apiKey) { setTestMsg({ ok: false, msg: 'API Key belum diisi.' }); return; }
    setTestLoading(true);
    setTestMsg(null);
    try {
      const user = await testConnection(apiKey);
      setTestMsg({ ok: true, msg: `Terhubung sebagai: ${user.name}` });
    } catch (e) {
      setTestMsg({ ok: false, msg: e.message });
    }
    setTestLoading(false);
  };

  // ─── Kirim satu ─────────────────────────────────────────────────────────────

  const handleSendOne = async (p) => {
    if (!apiKey) { alert('API Key belum dikonfigurasi. Buka panel Pengaturan Odoo.'); setShowSettings(true); return; }
    const companyId = UNIT_COMPANY[p.unit];
    if (!companyId) { alert(`Unit "${p.unit}" tidak ada di mapping Odoo.`); return; }

    setSending(prev => new Set([...prev, p.id]));
    try {
      const partnerId = await getOrCreatePartner(apiKey, p.nama_siswa);
      const prod      = await findProduct(apiKey, p.nama_program, companyId);
      const inv       = await createInvoice(apiKey, {
        companyId, partnerId,
        productId:    prod?.id || false,
        namaProgram:  p.nama_program,
        nominal:      p.nominal || 0,
        diskon:       p.diskon  || 0,
        tanggalBayar: p.tanggal_bayar,
        namaSiswa:    p.nama_siswa,
      });

      await supabase.from('pembayaran_spp').update({
        odoo_invoice_id:   inv.id,
        odoo_invoice_name: inv.name,
        odoo_status:       inv.status || 'not_paid',
        odoo_synced_at:    new Date().toISOString(),
        odoo_error:        null,
      }).eq('id', p.id);

      setTransaksis(prev => prev.map(t =>
        t.id === p.id
          ? { ...t, odoo_invoice_id: inv.id, odoo_invoice_name: inv.name, odoo_status: inv.status || 'not_paid', odoo_error: null }
          : t
      ));
    } catch (e) {
      await supabase.from('pembayaran_spp').update({
        odoo_status: 'error', odoo_error: e.message, odoo_synced_at: new Date().toISOString(),
      }).eq('id', p.id);
      setTransaksis(prev => prev.map(t =>
        t.id === p.id ? { ...t, odoo_status: 'error', odoo_error: e.message } : t
      ));
      alert(`Gagal kirim untuk ${p.nama_siswa}:\n${e.message}`);
    }
    setSending(prev => { const s = new Set(prev); s.delete(p.id); return s; });
  };

  // ─── Kirim banyak ───────────────────────────────────────────────────────────

  const handleSendSelected = async () => {
    if (selected.size === 0) { alert('Pilih minimal satu transaksi.'); return; }
    if (!apiKey) { alert('API Key belum dikonfigurasi.'); setShowSettings(true); return; }
    if (!confirm(`Kirim ${selected.size} faktur ke Odoo?`)) return;
    const ids = [...selected];
    setSelected(new Set());
    for (const id of ids) {
      const p = transaksis.find(t => t.id === id);
      if (p && !p.odoo_invoice_id) await handleSendOne(p);
    }
  };

  // ─── Refresh status ──────────────────────────────────────────────────────────

  const handleRefreshStatus = async (p) => {
    if (!p.odoo_invoice_id || !apiKey) return;
    const companyId = UNIT_COMPANY[p.unit];
    try {
      const inv = await getInvoiceStatus(apiKey, p.odoo_invoice_id, companyId);
      await supabase.from('pembayaran_spp').update({ odoo_status: inv.payment_state, odoo_synced_at: new Date().toISOString() }).eq('id', p.id);
      setTransaksis(prev => prev.map(t => t.id === p.id ? { ...t, odoo_status: inv.payment_state } : t));
    } catch (e) {
      alert('Gagal refresh: ' + e.message);
    }
  };

  // ─── Checkbox ───────────────────────────────────────────────────────────────

  const toggleSelect = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const belumKirimPage = pageData.filter(p => !p.odoo_invoice_id);
  const allPageSelected = belumKirimPage.length > 0 && belumKirimPage.every(p => selected.has(p.id));
  const toggleSelectAll = () => {
    if (allPageSelected) setSelected(prev => { const s = new Set(prev); belumKirimPage.forEach(p => s.delete(p.id)); return s; });
    else                 setSelected(prev => { const s = new Set(prev); belumKirimPage.forEach(p => s.add(p.id));  return s; });
  };

  const totalNominal    = filtered.reduce((s, p) => s + (p.nominal || 0), 0);
  const sudahKirimCount = filtered.filter(p => p.odoo_invoice_id).length;
  const belumKirimCount = filtered.filter(p => !p.odoo_invoice_id).length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>SPP</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FileSpreadsheet size={26} style={{ color: 'var(--primary)' }} />
            Faktur Odoo
          </h1>
        </div>
        <button onClick={() => setShowSettings(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: showSettings ? 'rgba(79,70,229,0.08)' : 'var(--surface-color)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
          <Settings size={15} /> Pengaturan Odoo {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem', borderLeft: '3px solid var(--primary)' }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '1rem', color: 'var(--primary)' }}>Konfigurasi Odoo</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Email Login Odoo</label>
              <input type="email" placeholder="admin@naik-kelas.com" value={email} onChange={e => setEmail(e.target.value)}
                style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>API Key Odoo</label>
              <div style={{ position: 'relative' }}>
                <input type={showKey ? 'text' : 'password'} placeholder="API Key dari Odoo..." value={apiKey} onChange={e => setApiKey(e.target.value)}
                  style={{ ...inp, width: '100%', boxSizing: 'border-box', paddingRight: '2.5rem' }} />
                <button onClick={() => setShowKey(v => !v)}
                  style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleTestConnection} disabled={testLoading}
              style={{ padding: '0.45rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <RefreshCw size={14} /> {testLoading ? 'Mengecek...' : 'Test Koneksi'}
            </button>
            <button onClick={handleSaveSettings} disabled={savingSettings}
              style={{ padding: '0.45rem 1rem', borderRadius: '0.5rem', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
              {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
            {testMsg && (
              <span style={{ fontSize: '0.82rem', color: testMsg.ok ? '#047857' : '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                {testMsg.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />} {testMsg.msg}
              </span>
            )}
          </div>
          <div style={{ marginTop: '0.85rem', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong>Mapping Unit → Odoo Company:</strong> Sarirejo (ID 2) · Plantaran (ID 3) · Krajankulon (ID 4) · Magelung (ID 5)<br />
            <strong>URL:</strong> https://naik-kelas.odoo.com &nbsp;·&nbsp; <strong>Database:</strong> naik-kelas
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        {[
          { label: 'Total Terverifikasi', value: `${filtered.length} transaksi`, color: 'var(--primary)' },
          { label: 'Sudah Dikirim ke Odoo', value: `${sudahKirimCount} transaksi`, color: '#047857' },
          { label: 'Belum Dikirim', value: `${belumKirimCount} transaksi`, color: '#d97706' },
        ].map(c => (
          <div key={c.label} className="glass-card" style={{ padding: '0.85rem 1rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{c.label}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input style={{ ...inp, paddingLeft: '2.2rem', width: '100%', boxSizing: 'border-box' }}
              placeholder="Cari nama siswa / program..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select style={inp} value={filterUnit} onChange={e => { setFilterUnit(e.target.value); setPage(1); }}>
            <option value="">Semua Unit</option>
            {allUnits.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select style={inp} value={filterProg} onChange={e => { setFilterProg(e.target.value); setPage(1); }}>
            <option value="">Semua Program</option>
            {allPrograms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select style={inp} value={filterMetode} onChange={e => { setFilterMetode(e.target.value); setPage(1); }}>
            <option value="">Semua Metode</option>
            <option value="Tunai">Tunai</option>
            <option value="Transfer Bank">Transfer Bank</option>
          </select>
          <select style={inp} value={filterOdoo} onChange={e => { setFilterOdoo(e.target.value); setPage(1); }}>
            <option value="">Status Odoo: Semua</option>
            <option value="belum">Belum Dikirim</option>
            <option value="sudah">Sudah Dikirim</option>
            <option value="error">Error</option>
          </select>
          <input type="date" style={{ ...inp, width: 140 }} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
          <input type="date" style={{ ...inp, width: 140 }} value={dateTo}   onChange={e => { setDateTo(e.target.value);   setPage(1); }} />
          {hasFilter && (
            <button onClick={resetFilter}
              style={{ background: 'none', border: '1px solid var(--glass-border)', borderRadius: '0.4rem', padding: '0.45rem 0.85rem', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Reset
            </button>
          )}
        </div>

        {selected.size > 0 && (
          <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{selected.size} dipilih</span>
            <button onClick={handleSendSelected}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 1rem', borderRadius: '0.5rem', border: 'none', background: '#0f766e', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
              <Send size={14} /> Kirim Terpilih ke Odoo
            </button>
            <button onClick={() => setSelected(new Set())}
              style={{ background: 'none', border: '1px solid var(--glass-border)', borderRadius: '0.4rem', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.82rem' }}>
              Batal Pilih
            </button>
          </div>
        )}
      </div>

      {/* Tabel */}
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        {loading ? <p style={{ color: 'var(--text-secondary)' }}>Memuat...</p>
          : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-secondary)' }}>
              <FileSpreadsheet size={40} style={{ opacity: 0.25, marginBottom: '0.75rem' }} />
              <p style={{ margin: 0 }}>Belum ada transaksi terverifikasi{hasFilter ? ' yang cocok.' : '.'}</p>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--glass-border)', background: 'rgba(79,70,229,0.04)' }}>
                      <th style={{ padding: '0.65rem 0.75rem', width: 36 }}>
                        <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} title="Pilih semua yg belum dikirim di halaman ini" />
                      </th>
                      {[
                        { l: 'TGL BAYAR',    a: 'left' },
                        { l: 'NAMA SISWA',   a: 'left' },
                        { l: 'PROGRAM',      a: 'left' },
                        { l: 'UNIT',         a: 'left' },
                        { l: 'NOMINAL SPP',  a: 'right' },
                        { l: 'DISKON',       a: 'right' },
                        { l: 'YANG DIBAYAR', a: 'right' },
                        { l: 'METODE',       a: 'left' },
                        { l: 'ODOO FAKTUR',  a: 'left' },
                        { l: 'STATUS ODOO',  a: 'center' },
                        { l: 'AKSI',         a: 'center' },
                      ].map(h => (
                        <th key={h.l} style={{ textAlign: h.a, padding: '0.65rem 0.75rem', fontWeight: 700, fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', letterSpacing: '0.06em' }}>{h.l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((p) => {
                      const gross      = (p.nominal || 0) + (p.diskon || 0);
                      const isSending  = sending.has(p.id);
                      const sudah      = !!p.odoo_invoice_id;
                      const isSelected = selected.has(p.id);
                      return (
                        <tr key={p.id}
                          style={{ borderBottom: '1px solid var(--glass-border)', background: isSelected ? 'rgba(79,70,229,0.05)' : 'transparent' }}
                          onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(79,70,229,0.03)'; }}
                          onMouseOut={e => {  if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            {!sudah && <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)} />}
                          </td>
                          <td style={{ padding: '0.75rem', whiteSpace: 'nowrap', fontWeight: 600 }}>{fmt(p.tanggal_bayar || p.created_at?.split('T')[0])}</td>
                          <td style={{ padding: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>{p.nama_siswa || '-'}</td>
                          <td style={{ padding: '0.75rem', color: 'var(--primary)', fontWeight: 500 }}>{p.nama_program || '-'}</td>
                          <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{p.unit || '-'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatRupiah(gross)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#b45309' }}>{p.diskon > 0 ? formatRupiah(p.diskon) : '-'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#047857' }}>{formatRupiah(p.nominal || 0)}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{ background: p.metode === 'Tunai' ? 'rgba(5,150,105,0.1)' : 'rgba(59,130,246,0.1)', color: p.metode === 'Tunai' ? '#047857' : '#1d4ed8', padding: '0.15rem 0.55rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 }}>
                              {p.metode || '-'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem', fontSize: '0.8rem' }}>
                            {p.odoo_invoice_name
                              ? <span style={{ fontWeight: 600, color: '#1d4ed8' }}>{p.odoo_invoice_name}</span>
                              : p.odoo_status === 'error'
                                ? <span style={{ color: '#b91c1c', fontSize: '0.75rem', cursor: 'help' }} title={p.odoo_error}>
                                    <AlertCircle size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} />Error
                                  </span>
                                : <span style={{ color: 'var(--text-secondary)' }}>—</span>
                            }
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}><OdooBadge row={p} /></td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            {isSending ? (
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                                <Clock size={13} /> Mengirim...
                              </span>
                            ) : sudah ? (
                              <button onClick={() => handleRefreshStatus(p)} title="Refresh status dari Odoo"
                                style={{ background: 'none', border: '1px solid var(--glass-border)', borderRadius: '0.4rem', padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)' }}>
                                <RefreshCw size={12} /> Refresh
                              </button>
                            ) : (
                              <button onClick={() => handleSendOne(p)}
                                style={{ background: '#0f766e', color: '#fff', border: 'none', borderRadius: '0.4rem', padding: '0.3rem 0.7rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Send size={12} /> Kirim
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--glass-border)', background: 'rgba(79,70,229,0.04)', fontWeight: 700 }}>
                      <td colSpan={5} style={{ padding: '0.75rem', fontSize: '0.82rem' }}>
                        TOTAL ({filtered.length} transaksi · {sudahKirimCount} terkirim ke Odoo)
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatRupiah(filtered.reduce((s, p) => s + (p.nominal || 0) + (p.diskon || 0), 0))}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#b45309' }}>{formatRupiah(filtered.reduce((s, p) => s + (p.diskon || 0), 0))}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#047857' }}>{formatRupiah(totalNominal)}</td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '0.85rem', gap: '0.35rem' }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
                    style={{ padding: '0.3rem 0.65rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', cursor: safePage <= 1 ? 'not-allowed' : 'pointer', opacity: safePage <= 1 ? 0.4 : 1 }}>‹</button>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Hal {safePage} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                    style={{ padding: '0.3rem 0.65rem', borderRadius: '0.4rem', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', cursor: safePage >= totalPages ? 'not-allowed' : 'pointer', opacity: safePage >= totalPages ? 0.4 : 1 }}>›</button>
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}
