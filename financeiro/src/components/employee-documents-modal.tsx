'use client';

import { useState, useEffect } from 'react';
import { AdminModalShell } from '@/components/admin/admin-modal-shell';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { toast } from '@/components/toast';

interface EmployeeDocumentsModalProps {
    employeeName: string;
    onClose: () => void;
}

interface Doc {
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    fileData: string;
    createdAt: string;
}

export function EmployeeDocumentsModal({ employeeName, onClose }: EmployeeDocumentsModalProps) {
    const { globalUnit } = useGlobalUnit();
    const [docs, setDocs] = useState<Doc[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employeeName, globalUnit]);

    const fetchDocs = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/payroll/documents?unit=${encodeURIComponent(globalUnit)}&employeeName=${encodeURIComponent(employeeName)}`);
            const data = await res.json();
            if (data.success) {
                setDocs(data.documents);
            }
        } catch (err) {
            console.error('Failed to fetch docs', err);
        }
        setLoading(false);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Limite simples (ex: 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast('O arquivo deve ter no máximo 5MB', 'error');
            return;
        }

        setUploading(true);
        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64Data = reader.result as string;
                const res = await fetch('/api/payroll/documents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        unit: globalUnit,
                        employeeName,
                        fileName: file.name,
                        fileType: file.type,
                        fileSize: file.size,
                        fileData: base64Data
                    })
                });
                const data = await res.json();
                if (data.success) {
                    toast('Documento salvo com sucesso!', 'success');
                    fetchDocs();
                } else {
                    toast(data.error || 'Erro ao salvar documento', 'error');
                }
                setUploading(false);
            };
        } catch (err) {
            console.error('File read error', err);
            toast('Erro ao processar o arquivo', 'error');
            setUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Deseja realmente excluir este documento?')) return;
        try {
            const res = await fetch(`/api/payroll/documents?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                toast('Documento excluído', 'success');
                fetchDocs();
            }
        } catch (err) {
            console.error('Delete doc error', err);
            toast('Erro ao excluir documento', 'error');
        }
    };

    return (
        <AdminModalShell onClose={onClose} maxWidth={500} cardPadding={28}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 12, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(99,102,241,0.1)', color: '#6366f1',
                        }}>
                            <span className="material-symbols-outlined">description</span>
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Documentos</h2>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>{employeeName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div style={{ marginBottom: 24 }}>
                    <label style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '16px', border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)',
                        cursor: uploading ? 'not-allowed' : 'pointer', background: 'var(--bg)',
                        color: 'var(--primary)', fontWeight: 700, transition: '0.2s',
                        opacity: uploading ? 0.6 : 1
                    }}>
                        <span className="material-symbols-outlined">upload_file</span>
                        {uploading ? 'Enviando...' : 'Anexar novo documento (PDF, Imagem, Word)'}
                        <input type="file" accept=".pdf,image/*,.doc,.docx" onChange={handleFileChange} style={{ display: 'none' }} disabled={uploading} />
                    </label>
                </div>

                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {loading ? (
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Carregando documentos...</p>
                    ) : docs.length === 0 ? (
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhum documento anexado ainda.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {docs.map(doc => (
                                <div key={doc.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                                    background: 'var(--bg)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                                        <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)', fontSize: 20 }}>draft</span>
                                        <div style={{ overflow: 'hidden' }}>
                                            <a href={doc.fileData} download={doc.fileName} target="_blank" rel="noreferrer" style={{
                                                display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)',
                                                textDecoration: 'none', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden'
                                            }}>
                                                {doc.fileName}
                                            </a>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                                {(doc.fileSize / 1024).toFixed(1)} KB • {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                                            </span>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDelete(doc.id)} style={{
                                        background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32,
                                        borderRadius: '50%', transition: '0.2s'
                                    }} title="Excluir">
                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
        </AdminModalShell>
    );
}
