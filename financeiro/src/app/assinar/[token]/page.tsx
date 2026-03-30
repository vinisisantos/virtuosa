'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';

export default function AssinarPage() {
  const { token } = useParams<{ token: string }>();
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signed, setSigned] = useState(false);
  const [signing, setSigning] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    if (!token) return;
    fetch('/api/signatures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get', token }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setContract(data.contract);
        setLoading(false);
      })
      .catch(() => { setError('Erro ao carregar contrato'); setLoading(false); });
  }, [token]);

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;

    const getPos = (e: MouseEvent | Touch) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const startDraw = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      isDrawing.current = true;
      const pos = 'touches' in e ? getPos(e.touches[0]) : getPos(e as MouseEvent);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawing.current) return;
      e.preventDefault();
      const pos = 'touches' in e ? getPos(e.touches[0]) : getPos(e as MouseEvent);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      setHasDrawn(true);
    };

    const stopDraw = () => { isDrawing.current = false; };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDraw);

    return () => {
      canvas.removeEventListener('mousedown', startDraw);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stopDraw);
      canvas.removeEventListener('mouseleave', stopDraw);
      canvas.removeEventListener('touchstart', startDraw);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', stopDraw);
    };
  }, [contract]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSign = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    setSigning(true);

    const signatureImage = canvas.toDataURL('image/png');

    try {
      let signerIp = '';
      try { const ipRes = await fetch('https://api.ipify.org?format=json'); const ipData = await ipRes.json(); signerIp = ipData.ip; } catch {}

      const res = await fetch('/api/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign', token, signatureImage, signerIp }),
      });
      const data = await res.json();
      if (data.success) {
        setSigned(true);
      } else {
        alert(data.error || 'Erro ao assinar');
      }
    } catch (err) {
      alert('Erro de conexão');
    }
    setSigning(false);
  };

  // ─── Loading ───
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '4px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#64748b', fontWeight: 600 }}>Carregando contrato...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ─── Error ───
  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 20px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef2f2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 32 }}>⚠️</span>
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 800, color: '#1e293b' }}>Contrato não disponível</h2>
          <p style={{ color: '#64748b', fontWeight: 500 }}>{error}</p>
        </div>
      </div>
    );
  }

  // ─── Already Signed ───
  if (contract?.status === 'assinado' || signed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 20px' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#dcfce7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: 44 }}>✅</span>
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 900, color: '#166534' }}>Contrato Assinado!</h2>
          <p style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.95rem' }}>
            {signed ? 'Sua assinatura foi registrada com sucesso.' : 'Este contrato já foi assinado anteriormente.'}
          </p>
          <p style={{ marginTop: 20, color: '#64748b', fontSize: '0.82rem', fontWeight: 500 }}>
            Assinado por: <strong>{contract?.clientName}</strong>
          </p>
        </div>
      </div>
    );
  }

  // ─── Signing Page ───
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 20px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 20, color: '#fff' }}>✍️</span>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>Assinatura Digital</h1>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{contract?.clientName} • {contract?.templateName}</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px' }}>
        {/* Contract Content — rendered as A4 page preserving original styles */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc' }}>
            <span style={{ fontSize: 16 }}>📄</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Contrato</span>
          </div>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <div
              style={{ padding: '48px 40px', background: '#fff', color: '#000', lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: contract?.content || '' }}
            />
          </div>
        </div>

        {/* Signature Area */}
        <div style={{ background: '#fff', borderRadius: 16, border: '2px solid #6366f1', padding: '24px 28px', marginBottom: 20, boxShadow: '0 4px 12px rgba(99,102,241,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>Assine aqui</h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Desenhe sua assinatura no campo abaixo</p>
            </div>
            <button onClick={clearCanvas} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit', color: '#64748b' }}>
              Limpar
            </button>
          </div>

          <div style={{ position: 'relative', borderRadius: 12, border: '2px dashed #cbd5e1', background: '#fafbfc', overflow: 'hidden' }}>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: 180, display: 'block', cursor: 'crosshair', touchAction: 'none' }}
            />
            {!hasDrawn && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <p style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.88rem' }}>✏️ Desenhe sua assinatura aqui</p>
              </div>
            )}
          </div>

          {/* Signer name */}
          <div style={{ marginTop: 14, padding: '10px 16px', borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>👤</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>{contract?.clientName}</span>
          </div>
        </div>

        {/* Sign Button */}
        <button
          onClick={handleSign}
          disabled={!hasDrawn || signing}
          style={{
            width: '100%', padding: '18px', borderRadius: 16, border: 'none',
            background: !hasDrawn || signing ? '#94a3b8' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            color: '#fff', fontWeight: 900, cursor: !hasDrawn || signing ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', fontSize: '1.05rem',
            boxShadow: hasDrawn && !signing ? '0 4px 16px rgba(99,102,241,0.3)' : 'none',
            transition: 'all 0.2s',
          }}
        >
          {signing ? '⏳ Registrando assinatura...' : hasDrawn ? '✅ Confirmar Assinatura' : '✏️ Desenhe sua assinatura acima'}
        </button>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>
          Ao assinar, você confirma que leu e concorda com todos os termos do contrato acima.
          <br />Sua assinatura será registrada com data, hora e endereço IP.
        </p>
      </div>
    </div>
  );
}
