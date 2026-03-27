import React from 'react';
import type { Profissional, AgendaForm, ProfForm } from './agenda-constants';
import { STATUS_COLORS, cardS, btnPrimary, inputS, selectS } from './agenda-constants';

interface AppointmentModalProps {
  editingId: string | null;
  form: AgendaForm; setForm: (f: AgendaForm) => void;
  profissionais: Profissional[];
  canMultiUnit: boolean;
  onSave: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function AppointmentModal({ editingId, form, setForm, profissionais, canMultiUnit, onSave, onDelete, onClose }: AppointmentModalProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ ...cardS, padding: 28, width: '90%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', animation: 'fadeInScale 0.25s ease-out' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>{editingId ? 'edit_calendar' : 'add_circle'}</span>
          {editingId ? 'Editar Agendamento' : 'Novo Agendamento'}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Cliente *</label>
            <input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} style={inputS} placeholder="Nome do cliente" />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Telefone</label>
            <input value={form.clientPhone} onChange={e => setForm({ ...form, clientPhone: e.target.value })} style={inputS} placeholder="(11) 99999-9999" />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Procedimento *</label>
            <input value={form.procedimento} onChange={e => setForm({ ...form, procedimento: e.target.value })} style={inputS} placeholder="Ex: Depilação Laser" />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Profissional *</label>
            <select value={form.profissionalId} onChange={e => setForm({ ...form, profissionalId: e.target.value })} style={selectS}>
              <option value="">Selecione</option>
              {profissionais.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Data *</label>
            <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} style={inputS} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Início</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <select value={form.startHour} onChange={e => setForm({ ...form, startHour: e.target.value })} style={{ ...selectS, flex: 1 }}>
                {Array.from({ length: 15 }, (_, i) => i + 7).map(h => <option key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}h</option>)}
              </select>
              <select value={form.startMin} onChange={e => setForm({ ...form, startMin: e.target.value })} style={{ ...selectS, flex: 1 }}>
                {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}min</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Fim</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <select value={form.endHour} onChange={e => setForm({ ...form, endHour: e.target.value })} style={{ ...selectS, flex: 1 }}>
                {Array.from({ length: 15 }, (_, i) => i + 7).map(h => <option key={h} value={String(h).padStart(2, '0')}>{String(h).padStart(2, '0')}h</option>)}
              </select>
              <select value={form.endMin} onChange={e => setForm({ ...form, endMin: e.target.value })} style={{ ...selectS, flex: 1 }}>
                {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}min</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Status</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={selectS}>
              {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Sala</label>
            <input value={form.sala} onChange={e => setForm({ ...form, sala: e.target.value })} style={inputS} placeholder="Ex: Sala A" />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Sessão</label>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="number" min={1} value={form.sessionNumber} onChange={e => setForm({ ...form, sessionNumber: e.target.value })} style={{ ...inputS, flex: 1 }} placeholder="Atual" />
              <span style={{ fontWeight: 800, color: 'var(--text-muted)' }}>/</span>
              <input type="number" min={1} value={form.totalSessions} onChange={e => setForm({ ...form, totalSessions: e.target.value })} style={{ ...inputS, flex: 1 }} placeholder="Total" />
            </div>
          </div>
          {canMultiUnit && (
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Unidade</label>
              <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={selectS}>
                {['Barueri', 'SCS', 'SBC', 'Osasco'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Observações</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inputS, minHeight: 60, resize: 'vertical' }} placeholder="Notas adicionais..." />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
          <div>
            {editingId && (
              <button onClick={() => { onDelete(editingId); onClose(); }} style={{ ...btnPrimary, background: 'linear-gradient(135deg, #ef4444, #f87171)', padding: '10px 16px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span> Excluir
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ ...btnPrimary, background: 'var(--bg)', color: 'var(--text-main)', border: '1px solid var(--border)', padding: '10px 20px' }}>Cancelar</button>
            <button onClick={onSave} disabled={!form.clientName || !form.procedimento || !form.profissionalId} style={{ ...btnPrimary, padding: '10px 20px', opacity: !form.clientName || !form.procedimento || !form.profissionalId ? 0.5 : 1 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> {editingId ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────── Professional Modal ──────────── */
interface ProfModalProps {
  profForm: ProfForm; setProfForm: (f: ProfForm) => void;
  onSave: () => void;
  onClose: () => void;
}

export function ProfissionalModal({ profForm, setProfForm, onSave, onClose }: ProfModalProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ ...cardS, padding: 28, width: '90%', maxWidth: 400, animation: 'fadeInScale 0.25s ease-out' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 20 }}>Novo Profissional</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Nome *</label>
            <input value={profForm.name} onChange={e => setProfForm({ ...profForm, name: e.target.value })} style={inputS} placeholder="Nome do profissional" />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Cor</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="color" value={profForm.color} onChange={e => setProfForm({ ...profForm, color: e.target.value })} style={{ width: 40, height: 36, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', padding: 0 }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>{profForm.color}</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Unidade</label>
              <select value={profForm.unit} onChange={e => setProfForm({ ...profForm, unit: e.target.value })} style={selectS}>
                {['Barueri', 'SCS', 'SBC', 'Osasco'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ ...btnPrimary, background: 'var(--bg)', color: 'var(--text-main)', border: '1px solid var(--border)' }}>Cancelar</button>
          <button onClick={onSave} disabled={!profForm.name} style={{ ...btnPrimary, opacity: !profForm.name ? 0.5 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> Criar
          </button>
        </div>
      </div>
    </div>
  );
}
