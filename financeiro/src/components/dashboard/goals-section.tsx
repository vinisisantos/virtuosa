'use client';
import { useState } from 'react';
import { MONTHS, UNITS, cardS, inputS, labelS, btnPrimary, formatCurrency, fmt } from '@/hooks/useDashboard';

interface Props {
  selectedMonth:number;
  goalInput:string; setGoalInput:(v:string)=>void;
  goalUnits:string[]; setGoalUnits:(v:string[])=>void;
  handleSaveGoal:()=>void;
}

const focusIn = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = 'var(--primary)';
  e.target.style.boxShadow = '0 0 0 4px rgba(230,0,126,0.1)';
  e.target.style.transform = 'translateY(-1px)';
};
const focusOut = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = 'var(--border)';
  e.target.style.boxShadow = 'none';
  e.target.style.transform = 'translateY(0)';
};
const btnHoverIn = (e: React.MouseEvent<HTMLButtonElement>) => {
  (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
  (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 25px rgba(230,0,126,0.35)';
};
const btnHoverOut = (e: React.MouseEvent<HTMLButtonElement>) => {
  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 15px rgba(230,0,126,0.25)';
};

export function GoalsSection({ selectedMonth, goalInput, setGoalInput, goalUnits, setGoalUnits, handleSaveGoal }:Props) {
  const [success, setSuccess] = useState(false);

  const handleGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGoalInput(formatCurrency(e.target.value));
  };

  const toggleUnit = (unit: string) => {
    if (goalUnits.includes(unit)) {
      setGoalUnits(goalUnits.filter(u => u !== unit));
    } else {
      setGoalUnits([...goalUnits, unit]);
    }
  };

  const selectAll = () => setGoalUnits([...UNITS]);
  const selectNone = () => setGoalUnits([]);

  const rawVal = goalInput.replace(/\./g, '').replace(',', '.');
  const numVal = parseFloat(rawVal) || 0;
  const totalPreview = numVal * goalUnits.length;

  const handleSave = () => {
    handleSaveGoal();
    setSuccess(true);
    setTimeout(() => setSuccess(false), 2500);
  };

  return (
    <div style={{maxWidth:600,margin:'0 auto'}}>
      <div style={{...cardS, position:'relative', overflow:'hidden'}}>
        {/* Success overlay */}
        {success && (
          <div style={{
            position:'absolute', inset:0, background:'rgba(16,185,129,0.08)',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', zIndex:10,
            animation:'fadeIn 0.3s ease',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize:48, color:'#10b981', marginBottom:8 }}>verified</span>
            <span style={{ fontSize:'1.2rem', fontWeight:800, color:'#10b981' }}>Meta salva com sucesso!</span>
            <span style={{ fontSize:'0.82rem', color:'var(--text-muted)', marginTop:4 }}>
              {goalUnits.length} unidade{goalUnits.length > 1 ? 's' : ''} atualizadas
            </span>
          </div>
        )}

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
          <div style={{
            width:46, height:46, borderRadius:14,
            background:'linear-gradient(135deg,var(--primary),#ff4db1)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 4px 15px rgba(230,0,126,0.3)',
          }}>
            <span className="material-symbols-outlined" style={{fontSize:22,color:'#fff'}}>flag</span>
          </div>
          <div>
            <h2 style={{margin:0,fontSize:'1.15rem',fontWeight:800}}>Meta de {MONTHS[selectedMonth]}</h2>
            <p style={{margin:0,fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:600}}>Defina o faturamento desejado por unidade</p>
          </div>
        </div>

        {/* Goal value input */}
        <div style={{marginBottom:20}}>
          <label style={labelS}>
            <span className="material-symbols-outlined" style={{fontSize:14,color:'var(--primary)'}}>payments</span>
            Valor da Meta por Unidade (R$)
          </label>
          <input value={goalInput} onChange={handleGoalChange} placeholder="0,00" style={{
            ...inputS, fontSize:'1.15rem', fontWeight:800, padding:'14px 18px',
            background: numVal > 0 ? 'rgba(230,0,126,0.03)' : 'var(--bg)',
          }} inputMode="numeric" onFocus={focusIn} onBlur={focusOut} />
        </div>

        {/* Unit selection */}
        <div style={{marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <label style={{...labelS,margin:0}}>
              <span className="material-symbols-outlined" style={{fontSize:14,color:'var(--primary)'}}>location_on</span>
              Unidades que receberão esta meta
            </label>
            <div style={{display:'flex',gap:8}}>
              <button onClick={selectAll} style={{background:'none',border:'none',color:'var(--primary)',fontSize:'0.72rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit',transition:'opacity 0.15s'}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='0.7'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}
              >Todas</button>
              <span style={{color:'var(--border)'}}>|</span>
              <button onClick={selectNone} style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:'0.72rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit',transition:'opacity 0.15s'}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='0.7'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='1'}
              >Nenhuma</button>
            </div>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {UNITS.map(u => {
              const isSelected = goalUnits.includes(u);
              return (
                <button key={u} onClick={() => toggleUnit(u)} style={{
                  display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderRadius:12,
                  border:isSelected?'2px solid var(--primary)':'2px solid var(--border)',
                  background:isSelected?'rgba(230,0,126,0.08)':'var(--bg)',
                  color:isSelected?'var(--primary)':'var(--text-muted)',
                  fontWeight:700,fontSize:'0.85rem',cursor:'pointer',fontFamily:'inherit',
                  transition:'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: isSelected ? '0 2px 8px rgba(230,0,126,0.15)' : 'none',
                }}>
                  <span className="material-symbols-outlined" style={{fontSize:18, transition:'transform 0.2s', transform: isSelected ? 'scale(1.2)' : 'scale(1)'}}>
                    {isSelected ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  {u}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview */}
        {numVal > 0 && goalUnits.length > 0 && (
          <div style={{
            background:'linear-gradient(135deg,rgba(230,0,126,0.05),rgba(99,102,241,0.04))',
            border:'1px solid rgba(230,0,126,0.12)',borderRadius:16,padding:'16px 20px',marginBottom:20,
            animation:'fadeIn 0.3s ease',
          }}>
            <div style={{display:'flex',alignItems:'center',gap:8,fontSize:'0.9rem',color:'var(--text-main)',fontWeight:600}}>
              <span className="material-symbols-outlined" style={{fontSize:18,color:'var(--primary)'}}>calculate</span>
              R$ {fmt(numVal)} × {goalUnits.length} unidade{goalUnits.length > 1 ? 's' : ''} = 
              <span style={{fontWeight:900,color:'var(--primary)',fontSize:'1.15rem',marginLeft:4}}>R$ {fmt(totalPreview)}</span>
            </div>
            <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:6,display:'flex',gap:6,flexWrap:'wrap'}}>
              {goalUnits.map(u => (
                <span key={u} style={{background:'rgba(230,0,126,0.08)',padding:'2px 8px',borderRadius:6,fontWeight:600}}>{u}</span>
              ))}
            </div>
          </div>
        )}

        <button onClick={handleSave} onMouseEnter={btnHoverIn} onMouseLeave={btnHoverOut}
          disabled={numVal === 0 || goalUnits.length === 0}
          style={{
            ...btnPrimary,
            opacity: numVal > 0 && goalUnits.length > 0 ? 1 : 0.5,
            cursor: numVal > 0 && goalUnits.length > 0 ? 'pointer' : 'not-allowed',
          }}>
          <span className="material-symbols-outlined">check_circle</span> 
          Salvar Meta {goalUnits.length > 0 ? `para ${goalUnits.length} unidade${goalUnits.length > 1 ? 's' : ''}` : ''}
        </button>
      </div>

      {/* Info Cards */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:20}}>
        <div style={{...cardS, padding:20}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <span className="material-symbols-outlined" style={{fontSize:18,color:'var(--primary)'}}>lightbulb</span>
            <span style={{fontWeight:700,color:'var(--primary)',fontSize:'0.88rem'}}>Por que metas?</span>
          </div>
          <p style={{color:'var(--text-muted)',fontSize:'0.82rem',lineHeight:1.5,margin:0}}>
            Metas claras ajudam sua clínica a manter o foco em resultados e acompanhar o progresso.
          </p>
        </div>
        <div style={{...cardS, padding:20}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <span className="material-symbols-outlined" style={{fontSize:18,color:'#f59e0b'}}>trending_up</span>
            <span style={{fontWeight:700,color:'#f59e0b',fontSize:'0.88rem'}}>Dica de Gestão</span>
          </div>
          <p style={{color:'var(--text-muted)',fontSize:'0.82rem',lineHeight:1.5,margin:0}}>
            Analise o faturamento dos meses anteriores para definir uma meta realista.
          </p>
        </div>
      </div>
    </div>
  );
}
