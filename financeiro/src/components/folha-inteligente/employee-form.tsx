'use client';
import { useState } from 'react';
import type { SmartEmployee, PayrollSettings } from '@/lib/payroll-calc';
import { DEFAULT_SETTINGS } from '@/lib/payroll-calc';
import { formatCurrency, parseCur } from '@/hooks/useDashboard';
import { useGlobalUnit } from '@/contexts/UnitContext';

const cardS: React.CSSProperties = { background:'var(--card-bg)',backdropFilter:'blur(20px)',borderRadius:20,border:'1px solid var(--border)',boxShadow:'var(--shadow-sm)',padding:'20px 24px' };
const inputS: React.CSSProperties = { width:'100%',padding:'10px 14px',borderRadius:10,border:'2px solid var(--border)',outline:'none',fontSize:'0.85rem',background:'var(--bg)',boxSizing:'border-box',color:'var(--text-main)',fontFamily:'inherit',fontWeight:600,transition:'border-color 0.2s' };
const labelS: React.CSSProperties = { display:'flex',alignItems:'center',gap:4,fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px' };
// Payroll may include Mogi as well
const PAYROLL_EXTRA_UNITS = ['Mogi'];

interface Props { employee?: SmartEmployee; settings: PayrollSettings; onSave: (emp: SmartEmployee) => void; onClose: () => void; }

export function EmployeeFormModal({ employee, settings, onSave, onClose }: Props) {
  const { units: contextUnits } = useGlobalUnit();
  const UNITS = [...new Set([...contextUnits, ...PAYROLL_EXTRA_UNITS])];
  const [nome, setNome] = useState(employee?.nome || '');
  const [unidade, setUnidade] = useState(employee?.unidade || contextUnits[0] || 'SCS');
  const [cargo, setCargo] = useState(employee?.cargo || '');
  const [tipo, setTipo] = useState<'CLT'|'PJ'>(employee?.tipo || 'CLT');
  const [salarioBase, setSalarioBase] = useState(employee?.salarioBase ? employee.salarioBase.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : '');
  const [insalubridade, setInsalubridade] = useState(employee?.insalubridade || false);
  const [rt, setRt] = useState(employee?.rt || false);
  const [vr, setVr] = useState(employee?.vr ? employee.vr.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : '');
  const [status, setStatus] = useState<'ativo'|'inativo'>(employee?.status || 'ativo');

  const handleSave = () => {
    if (!nome.trim() || !cargo.trim()) return;
    const sal = parseCur(salarioBase);
    const vrVal = parseCur(vr);
    onSave({
      id: employee?.id || Date.now().toString(),
      nome: nome.trim(), unidade, cargo: cargo.trim(), tipo,
      salarioBase: sal, insalubridade, rt, vr: vrVal, status,
      createdAt: employee?.createdAt || new Date().toISOString(),
    });
  };

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(6px)',display:'flex',justifyContent:'center',alignItems:'center',padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{...cardS,maxWidth:600,width:'100%',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h2 style={{margin:0,fontSize:'1.15rem',fontWeight:800,display:'flex',alignItems:'center',gap:8}}>
            <span className="material-symbols-outlined" style={{color:'#6366f1'}}>person_add</span>
            {employee ? 'Editar Colaborador' : 'Novo Colaborador'}
          </h2>
          <button onClick={onClose} style={{width:32,height:32,borderRadius:8,border:'1px solid var(--border)',background:'var(--bg)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <span className="material-symbols-outlined" style={{fontSize:16}}>close</span>
          </button>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div style={{gridColumn:'span 2'}}>
            <label style={labelS}>Nome</label>
            <input value={nome} onChange={e=>setNome(e.target.value)} placeholder="Nome completo" style={inputS} />
          </div>
          <div>
            <label style={labelS}>Unidade</label>
            <select value={unidade} onChange={e=>setUnidade(e.target.value)} style={{...inputS,height:42}}>{UNITS.map(u=><option key={u}>{u}</option>)}</select>
          </div>
          <div>
            <label style={labelS}>Cargo</label>
            <input value={cargo} onChange={e=>setCargo(e.target.value)} placeholder="Ex: Esteticista" style={inputS} />
          </div>
          <div>
            <label style={labelS}>Tipo</label>
            <div style={{display:'flex',gap:6}}>
              {(['CLT','PJ'] as const).map(t=>(
                <button key={t} onClick={()=>setTipo(t)} style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${tipo===t?t==='CLT'?'#6366f1':'#f59e0b':'var(--border)'}`,background:tipo===t?t==='CLT'?'rgba(99,102,241,0.08)':'rgba(245,158,11,0.08)':'var(--bg)',fontWeight:700,fontSize:'0.88rem',cursor:'pointer',fontFamily:'inherit',color:tipo===t?t==='CLT'?'#6366f1':'#f59e0b':'var(--text-muted)',transition:'all 0.2s'}}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelS}>Salário Base (R$)</label>
            <input value={salarioBase} onChange={e=>setSalarioBase(formatCurrency(e.target.value))} placeholder="0,00" inputMode="numeric" style={inputS} />
          </div>
          {tipo === 'CLT' && (
            <>
              <div>
                <label style={labelS}>Insalubridade (20% do SM = R${(settings.salarioMinimo*0.2).toFixed(0)})</label>
                <div style={{display:'flex',gap:6}}>
                  {[{v:true,l:'Sim',c:'#10b981'},{v:false,l:'Não',c:'#ef4444'}].map(o=>(
                    <button key={String(o.v)} onClick={()=>setInsalubridade(o.v)} style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${insalubridade===o.v?o.c:'var(--border)'}`,background:insalubridade===o.v?`${o.c}10`:'var(--bg)',fontWeight:700,fontSize:'0.85rem',cursor:'pointer',fontFamily:'inherit',color:insalubridade===o.v?o.c:'var(--text-muted)'}}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelS}>RT ({settings.valorRT.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})})</label>
                <div style={{display:'flex',gap:6}}>
                  {[{v:true,l:'Sim',c:'#10b981'},{v:false,l:'Não',c:'#ef4444'}].map(o=>(
                    <button key={String(o.v)} onClick={()=>setRt(o.v)} style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${rt===o.v?o.c:'var(--border)'}`,background:rt===o.v?`${o.c}10`:'var(--bg)',fontWeight:700,fontSize:'0.85rem',cursor:'pointer',fontFamily:'inherit',color:rt===o.v?o.c:'var(--text-muted)'}}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div>
            <label style={labelS}>VR (R$)</label>
            <input value={vr} onChange={e=>setVr(formatCurrency(e.target.value))} placeholder="0,00" inputMode="numeric" style={inputS} />
          </div>
          <div>
            <label style={labelS}>Status</label>
            <div style={{display:'flex',gap:6}}>
              {[{v:'ativo' as const,l:'Ativo',c:'#10b981'},{v:'inativo' as const,l:'Inativo',c:'#ef4444'}].map(o=>(
                <button key={o.v} onClick={()=>setStatus(o.v)} style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${status===o.v?o.c:'var(--border)'}`,background:status===o.v?`${o.c}10`:'var(--bg)',fontWeight:700,fontSize:'0.85rem',cursor:'pointer',fontFamily:'inherit',color:status===o.v?o.c:'var(--text-muted)'}}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={handleSave} style={{marginTop:20,width:'100%',padding:'14px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#6366f1,#8b5cf6)',color:'#fff',fontWeight:800,fontSize:'0.95rem',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 15px rgba(99,102,241,0.3)',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          <span className="material-symbols-outlined" style={{fontSize:20}}>save</span>
          {employee ? 'Salvar Alterações' : 'Adicionar Colaborador'}
        </button>
      </div>
    </div>
  );
}
