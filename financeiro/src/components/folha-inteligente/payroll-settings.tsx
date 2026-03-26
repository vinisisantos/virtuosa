'use client';
import { useState } from 'react';
import type { PayrollSettings } from '@/lib/payroll-calc';
import { formatBRL } from '@/lib/payroll-calc';

const inputS: React.CSSProperties = { width:'100%',padding:'10px 14px',borderRadius:10,border:'2px solid var(--border)',outline:'none',fontSize:'0.85rem',background:'var(--bg)',boxSizing:'border-box',color:'var(--text-main)',fontFamily:'inherit',fontWeight:600 };
const labelS: React.CSSProperties = { display:'flex',alignItems:'center',gap:4,fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px' };

interface Props { settings: PayrollSettings; onSave: (s: PayrollSettings) => void; onClose: () => void; }

export function PayrollSettingsModal({ settings, onSave, onClose }: Props) {
  const [s, setS] = useState<PayrollSettings>(JSON.parse(JSON.stringify(settings)));

  const updateFaixa = (i: number, field: 'limite' | 'aliquota', val: string) => {
    const faixas = [...s.faixasINSS];
    faixas[i] = { ...faixas[i], [field]: parseFloat(val) || 0 };
    setS({ ...s, faixasINSS: faixas });
  };
  const addFaixa = () => setS({ ...s, faixasINSS: [...s.faixasINSS, { limite: 0, aliquota: 0 }] });
  const removeFaixa = (i: number) => { const f = [...s.faixasINSS]; f.splice(i, 1); setS({ ...s, faixasINSS: f }); };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', padding: '24px', maxWidth: 550, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: '#8b5cf6' }}>settings</span>Configurações da Folha
          </h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelS}>Salário Mínimo (R$)</label>
            <input value={s.salarioMinimo} onChange={e => setS({ ...s, salarioMinimo: parseFloat(e.target.value) || 0 })} type="number" style={inputS} />
          </div>
          <div>
            <label style={labelS}>Valor RT (R$)</label>
            <input value={s.valorRT} onChange={e => setS({ ...s, valorRT: parseFloat(e.target.value) || 0 })} type="number" style={inputS} />
          </div>
          <div>
            <label style={labelS}>VT (%)</label>
            <input value={(s.percentualVT * 100).toFixed(0)} onChange={e => setS({ ...s, percentualVT: (parseFloat(e.target.value) || 0) / 100 })} type="number" style={inputS} />
          </div>
          <div>
            <label style={labelS}>FGTS (%)</label>
            <input value={(s.percentualFGTS * 100).toFixed(0)} onChange={e => setS({ ...s, percentualFGTS: (parseFloat(e.target.value) || 0) / 100 })} type="number" style={inputS} />
          </div>
          <div>
            <label style={labelS}>INSS Patronal (%)</label>
            <input value={(s.percentualINSSPatronal * 100).toFixed(0)} onChange={e => setS({ ...s, percentualINSSPatronal: (parseFloat(e.target.value) || 0) / 100 })} type="number" style={inputS} />
          </div>
          <div>
            <label style={labelS}>RT entra no FGTS?</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ v: true, l: 'Sim' }, { v: false, l: 'Não' }].map(o => (
                <button key={String(o.v)} onClick={() => setS({ ...s, rtEntraNoFGTS: o.v })} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `2px solid ${s.rtEntraNoFGTS === o.v ? '#6366f1' : 'var(--border)'}`, background: s.rtEntraNoFGTS === o.v ? 'rgba(99,102,241,0.08)' : 'var(--bg)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', color: s.rtEntraNoFGTS === o.v ? '#6366f1' : 'var(--text-muted)' }}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Faixas INSS */}
        <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ef4444', marginTop: 20, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>receipt</span>Faixas do INSS
        </h3>
        {s.faixasINSS.map((f, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 6, alignItems: 'end' }}>
            <div>
              <label style={{ ...labelS, fontSize: '0.65rem' }}>Limite R$ (Faixa {i + 1})</label>
              <input value={f.limite} onChange={e => updateFaixa(i, 'limite', e.target.value)} type="number" style={inputS} />
            </div>
            <div>
              <label style={{ ...labelS, fontSize: '0.65rem' }}>Alíquota %</label>
              <input value={(f.aliquota * 100).toFixed(1)} onChange={e => updateFaixa(i, 'aliquota', String((parseFloat(e.target.value) || 0) / 100))} type="number" step="0.1" style={inputS} />
            </div>
            <button onClick={() => removeFaixa(i)} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ef4444' }}>close</span>
            </button>
          </div>
        ))}
        <button onClick={addFaixa} style={{ marginTop: 4, padding: '6px 14px', borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>Adicionar Faixa
        </button>

        <button onClick={() => { onSave(s); onClose(); }} style={{ marginTop: 20, width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#8b5cf6,#a78bfa)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 15px rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>save</span>Salvar Configurações
        </button>
      </div>
    </div>
  );
}
