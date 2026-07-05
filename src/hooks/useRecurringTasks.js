import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/authStore';

// 0=Senin..6=Minggu → JS getDay() 0=Minggu..6=Sabtu
const toJsDay = (d) => (d === 6 ? 0 : d + 1);

function calcNextDate(rule, fromDateStr) {
  const from = new Date(fromDateStr + 'T00:00:00');

  if (rule.frekuensi === 'harian') {
    const next = new Date(from);
    next.setDate(next.getDate() + 1);
    return next.toISOString().split('T')[0];
  }

  if (rule.frekuensi === 'mingguan') {
    const jsDays = (rule.hari_dalam_minggu || []).map(toJsDay).sort((a, b) => a - b);
    if (!jsDays.length) return null;
    for (let i = 1; i <= 7; i++) {
      const c = new Date(from);
      c.setDate(c.getDate() + i);
      if (jsDays.includes(c.getDay())) return c.toISOString().split('T')[0];
    }
    return null;
  }

  if (rule.frekuensi === 'bulanan') {
    const tgl = rule.tanggal_dalam_bulan;
    if (!tgl) return null;
    const next = new Date(from);
    next.setMonth(next.getMonth() + 1);
    next.setDate(tgl);
    return next.toISOString().split('T')[0];
  }

  return null;
}

const SESSION_KEY = 'recurring_generated';

export function useRecurringTasks() {
  const { user } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (!user?.id || ran.current) return;
    // Satu kali per sesi browser
    if (sessionStorage.getItem(SESSION_KEY)) { ran.current = true; return; }
    ran.current = true;
    generate();
  }, [user?.id]);

  const generate = async () => {
    const today = new Date().toISOString().split('T')[0];

    const { data: rules, error } = await supabase
      .from('task_recurring_rules')
      .select('*')
      .eq('aktif', true)
      .lte('next_run_date', today)
      .not('next_run_date', 'is', null);

    if (error || !rules?.length) {
      sessionStorage.setItem(SESSION_KEY, '1');
      return;
    }

    for (const rule of rules) {
      const { data: task, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          judul: rule.judul_template,
          deskripsi: rule.deskripsi_template || null,
          project_id: rule.project_id || null,
          stage_id: rule.stage_id_awal || null,
          prioritas: rule.prioritas,
          label_id: rule.label_id || null,
          unit_id: rule.unit_id,
          dibuat_oleh: rule.dibuat_oleh || null,
          recurring_rule_id: rule.id,
        })
        .select()
        .single();

      if (taskErr || !task) continue;

      if (rule.assignee_guru_ids?.length) {
        await supabase.from('task_assignees').insert(
          rule.assignee_guru_ids.map((gid) => ({ task_id: task.id, guru_id: gid }))
        );
      }

      const nextDate = calcNextDate(rule, today);
      await supabase
        .from('task_recurring_rules')
        .update({ next_run_date: nextDate })
        .eq('id', rule.id);
    }

    sessionStorage.setItem(SESSION_KEY, '1');
  };
}
