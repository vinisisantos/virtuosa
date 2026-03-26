'use client';

import { useState, useRef, useCallback } from 'react';

interface UploadZoneProps {
    onUpload: (file: File, unit: string) => Promise<void>;
    onClose: () => void;
}

export function UploadZone({ onUpload, onClose }: UploadZoneProps) {
    const [dragActive, setDragActive] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedUnit, setSelectedUnit] = useState('Barueri');
    const [processing, setProcessing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setDragActive(e.type === 'dragenter' || e.type === 'dragover');
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type === 'application/pdf') setSelectedFile(file);
    }, []);

    const handleSubmit = async () => {
        if (!selectedFile) return;
        setProcessing(true);
        try { await onUpload(selectedFile, selectedUnit); } finally { setProcessing(false); }
    };

    const formatSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

    const modalBg = { position: 'fixed' as const, inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', padding: 20 };
    const modalCard = { background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', maxWidth: 500, width: '100%', padding: 28 };

    return (
        <div style={modalBg} onClick={onClose}>
            <div style={modalCard} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>upload_file</span>
                        Importar Folha de Pagamento
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Drop Zone */}
                <div
                    style={{
                        border: '2px dashed',
                        borderColor: dragActive ? 'var(--primary)' : selectedFile ? 'var(--success)' : 'var(--border)',
                        borderRadius: 'var(--radius-lg)', padding: '40px 20px',
                        textAlign: 'center', cursor: 'pointer',
                        transition: 'var(--transition)',
                        background: dragActive ? 'var(--primary-light)' : selectedFile ? 'var(--success-light)' : 'var(--bg)',
                    }}
                    onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag}
                    onDrop={handleDrop} onClick={() => inputRef.current?.click()}
                >
                    <input ref={inputRef} type="file" accept=".pdf" onChange={e => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]); }} style={{ display: 'none' }} />

                    {selectedFile ? (
                        <>
                            <div style={{ width: 48, height: 48, background: 'var(--success-light)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--success)' }}>description</span>
                            </div>
                            <p style={{ fontWeight: 700, color: 'var(--success)' }}>{selectedFile.name}</p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>{formatSize(selectedFile.size)}</p>
                            <button onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }} style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginTop: 8 }}>
                                Trocar arquivo
                            </button>
                        </>
                    ) : (
                        <>
                            <div style={{ width: 56, height: 56, background: 'var(--primary-light)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>cloud_upload</span>
                            </div>
                            <p style={{ fontWeight: 700, fontSize: '1rem' }}>Arraste o PDF aqui</p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>ou clique para selecionar</p>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>Apenas arquivos PDF</p>
                        </>
                    )}
                </div>

                {/* Unit Selector */}
                {selectedFile && !processing && (
                    <div style={{ marginTop: 24, padding: '16px', background: 'var(--bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Selecione a Unidade:
                            <select
                                value={selectedUnit}
                                onChange={(e) => setSelectedUnit(e.target.value)}
                                style={{
                                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border)', background: 'var(--bg)',
                                    fontFamily: 'inherit', fontSize: '0.95rem', cursor: 'pointer', outline: 'none'
                                }}
                            >
                                <option value="Barueri">Barueri</option>
                                <option value="SCS">SCS</option>
                                <option value="SBC">SBC</option>
                                <option value="Osasco">Osasco</option>
                            </select>
                        </label>
                    </div>
                )}

                {/* Processing Status */}
                {processing && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--primary-light)', borderRadius: 'var(--radius-md)', padding: 14, marginTop: 16 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
                        <div>
                            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)' }}>Processando PDF...</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Extraindo dados da folha de pagamento</p>
                        </div>
                        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <button onClick={onClose} style={{
                        flex: 1, padding: '12px 20px', border: '2px solid var(--border)',
                        borderRadius: 'var(--radius-md)', background: 'var(--bg)',
                        fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem',
                        color: 'var(--text-muted)', cursor: 'pointer',
                    }}>Cancelar</button>
                    <button onClick={handleSubmit} disabled={!selectedFile || processing} style={{
                        flex: 1, padding: '12px 20px', border: 'none',
                        borderRadius: 'var(--radius-md)',
                        background: (!selectedFile || processing) ? 'var(--border)' : 'var(--primary)',
                        fontFamily: 'inherit', fontWeight: 700, fontSize: '0.9rem',
                        color: (!selectedFile || processing) ? 'var(--text-muted)' : 'white',
                        cursor: (!selectedFile || processing) ? 'not-allowed' : 'pointer',
                        boxShadow: (!selectedFile || processing) ? 'none' : '0 4px 12px rgba(230, 0, 126, 0.25)',
                    }}>{processing ? 'Processando...' : 'Processar PDF'}</button>
                </div>
            </div>
        </div>
    );
}
