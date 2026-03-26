'use client';
import { DueBill, fmt } from '@/hooks/useDashboard';

interface Props {
  dueBills:DueBill[];
  showPopup:boolean; setShowPopup:(v:boolean)=>void;
  showMiniBell:boolean; setShowMiniBell:(v:boolean)=>void;
  markPaid:(id:number)=>void;
}

export function PaymentReminder({ dueBills, showPopup, setShowPopup, showMiniBell, setShowMiniBell, markPaid }:Props) {
  if (dueBills.length === 0) return null;

  return (
    <>
      {showPopup && (
        <div style={{position:'fixed',bottom:20,right:20,width:380,maxHeight:'60vh',background:'var(--card-bg)',backdropFilter:'blur(20px)',borderRadius:20,boxShadow:'0 15px 40px rgba(0,0,0,0.15)',zIndex:9999,overflow:'hidden',border:'1px solid var(--border)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:'1px solid var(--border)',background:'rgba(255,152,0,0.05)'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}><span className="material-symbols-outlined" style={{color:'#ff9800'}}>notifications_active</span><span style={{fontWeight:800,fontSize:'0.95rem'}}>Pagamentos Próximos</span><span style={{background:'#ff9800',color:'#fff',borderRadius:20,padding:'2px 10px',fontSize:'0.75rem',fontWeight:700}}>{dueBills.length}</span></div>
            <button onClick={()=>{setShowPopup(false);setShowMiniBell(true);}} style={{width:28,height:28,borderRadius:8,border:'none',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><span className="material-symbols-outlined" style={{fontSize:20,color:'var(--text-muted)'}}>close</span></button>
          </div>
          <div style={{padding:16,overflowY:'auto',maxHeight:'45vh'}}>
            {dueBills.map(b=>(
              <div key={b.id} style={{padding:14,borderRadius:14,border:`1px solid ${b.isOverdue||b.diffDays===0?'rgba(239,68,68,0.2)':'rgba(255,152,0,0.15)'}`,background:b.isOverdue||b.diffDays===0?'rgba(239,68,68,0.03)':'rgba(255,152,0,0.03)',marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:'0.9rem',marginBottom:6}}><span>{b.name}</span><span>{fmt(b.value)}</span></div>
                <div style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.78rem',color:'var(--text-muted)',marginBottom:8}}>
                  <span className="material-symbols-outlined" style={{fontSize:14}}>calendar_month</span>
                  {b.dueDate.toLocaleDateString('pt-BR')} • {b.isOverdue?`Vencida há ${Math.abs(b.diffDays)} dia${Math.abs(b.diffDays)>1?'s':''}`:b.diffDays===0?'Vence hoje!':`Vence em ${b.diffDays} dia${b.diffDays>1?'s':''}`}
                  <span style={{padding:'1px 8px',borderRadius:6,fontSize:'0.7rem',fontWeight:700,background:b.isOverdue||b.diffDays===0?'rgba(239,68,68,0.1)':'rgba(255,152,0,0.1)',color:b.isOverdue||b.diffDays===0?'#ef4444':'#ff9800'}}>{b.isOverdue?'Vencida':b.diffDays===0?'Hoje':'Próximo'}</span>
                </div>
                <button onClick={()=>markPaid(b.id)} style={{padding:'6px 14px',borderRadius:8,border:'none',background:'rgba(16,185,129,0.1)',color:'#10b981',fontWeight:700,fontSize:'0.8rem',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}><span className="material-symbols-outlined" style={{fontSize:16}}>check_circle</span> Marcar como Pago</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showMiniBell && !showPopup && (
        <button onClick={()=>{setShowMiniBell(false);setShowPopup(true);}} style={{position:'fixed',bottom:20,right:20,width:56,height:56,borderRadius:'50%',border:'none',background:'linear-gradient(135deg,#ff9800,#f57c00)',color:'#fff',boxShadow:'0 4px 20px rgba(255,152,0,0.4)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999}}>
          <span className="material-symbols-outlined" style={{fontSize:28}}>notifications</span>
          <span style={{position:'absolute',top:-4,right:-4,background:'#ef4444',color:'#fff',borderRadius:20,padding:'1px 7px',fontSize:'0.7rem',fontWeight:800}}>{dueBills.length}</span>
        </button>
      )}
    </>
  );
}
