'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function AvaliarPage() {
  const { token } = useParams<{ token: string }>();
  const [survey, setSurvey] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [score, setScore] = useState<number>(0);
  const [hoveredScore, setHoveredScore] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/surveys/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setSurvey(data);
          if (data.status === 'answered') {
            setSubmitted(true);
          }
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Erro ao carregar a pesquisa de satisfação.');
        setLoading(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (score === 0) {
      alert('Por favor, selecione uma nota de 1 a 5 estrelas.');
      return;
    }
    setSubmitting(true);

    try {
      const res = await fetch(`/api/surveys/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, comment }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        alert(data.error || 'Erro ao enviar a avaliação.');
      }
    } catch (err) {
      alert('Erro de conexão ao enviar a avaliação.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.spinnerCard}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Carregando avaliação...</p>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error && !submitted) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.errorIcon}>⚠️</div>
          <h2 style={styles.title}>Avaliação Indisponível</h2>
          <p style={styles.description}>{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.successIcon}>✨</div>
          <h2 style={styles.title}>Muito Obrigado!</h2>
          <p style={styles.description}>
            Sua opinião é muito importante para nós. Ela nos ajuda a melhorar constantemente a qualidade do nosso atendimento.
          </p>
          <div style={styles.successBadge}>
            Avaliação registrada com sucesso!
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logoHeader}>
          <span style={styles.logoText}>Virtuosa</span>
          <span style={styles.logoSubtext}>Pesquisa de Satisfação</span>
        </div>

        <h2 style={styles.greeting}>
          Olá, <span style={styles.clientName}>{survey?.clientName}</span>!
        </h2>
        
        <p style={styles.intro}>
          Como você avalia o seu atendimento com o(a) profissional <strong style={{ color: '#1e293b' }}>{survey?.profissional || 'da nossa equipe'}</strong>?
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.starContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                style={{
                  ...styles.starButton,
                  transform: (hoveredScore || score) >= star ? 'scale(1.15)' : 'scale(1)',
                }}
                onMouseEnter={() => setHoveredScore(star)}
                onMouseLeave={() => setHoveredScore(0)}
                onClick={() => setScore(star)}
              >
                <span
                  style={{
                    ...styles.starIcon,
                    color: (hoveredScore || score) >= star ? '#f59e0b' : '#cbd5e1',
                  }}
                >
                  ★
                </span>
              </button>
            ))}
          </div>

          <div style={styles.scoreText}>
            {score > 0 ? (
              <span style={styles.selectedScoreLabel}>
                Nota selecionada: <strong>{score}</strong>/5
              </span>
            ) : (
              <span style={styles.placeholderScoreLabel}>Selecione uma nota</span>
            )}
          </div>

          <div style={styles.textareaGroup}>
            <label htmlFor="comment" style={styles.label}>
              Deseja deixar algum comentário ou sugestão? (Opcional)
            </label>
            <textarea
              id="comment"
              style={styles.textarea}
              placeholder="Digite aqui..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
            />
          </div>

          <button
            type="submit"
            disabled={score === 0 || submitting}
            style={{
              ...styles.submitButton,
              backgroundColor: score === 0 || submitting ? '#94a3b8' : '#6366f1',
              cursor: score === 0 || submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Enviando...' : 'Enviar Avaliação'}
          </button>
        </form>
      </div>
      <style>{`
        textarea:focus {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15) !important;
        }
        button:active:not(:disabled) {
          transform: scale(0.98) !important;
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    padding: '20px',
  },
  spinnerCard: {
    textAlign: 'center' as const,
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e2e8f0',
    borderTopColor: '#6366f1',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 16px',
  },
  loadingText: {
    color: '#64748b',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '24px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
    border: '1px solid #f1f5f9',
    width: '100%',
    maxWidth: '480px',
    padding: '40px 32px',
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  logoHeader: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    marginBottom: '28px',
  },
  logoText: {
    fontSize: '1.6rem',
    fontWeight: 900,
    color: '#1e293b',
    letterSpacing: '-0.025em',
    textTransform: 'uppercase' as const,
  },
  logoSubtext: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#6366f1',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginTop: '2px',
  },
  greeting: {
    fontSize: '1.35rem',
    fontWeight: 800,
    color: '#1e293b',
    margin: '0 0 8px 0',
  },
  clientName: {
    color: '#6366f1',
  },
  intro: {
    fontSize: '0.95rem',
    color: '#64748b',
    lineHeight: '1.5',
    margin: '0 0 32px 0',
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  starContainer: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    marginBottom: '12px',
  },
  starButton: {
    background: 'none',
    border: 'none',
    padding: '0',
    outline: 'none',
    transition: 'transform 0.15s ease-in-out',
  },
  starIcon: {
    fontSize: '2.8rem',
    lineHeight: '1',
    transition: 'color 0.15s ease-in-out',
    userSelect: 'none' as const,
  },
  scoreText: {
    minHeight: '24px',
    marginBottom: '28px',
  },
  selectedScoreLabel: {
    fontSize: '0.88rem',
    color: '#475569',
    fontWeight: 500,
  },
  placeholderScoreLabel: {
    fontSize: '0.88rem',
    color: '#94a3b8',
    fontWeight: 500,
  },
  textareaGroup: {
    width: '100%',
    textAlign: 'left' as const,
    marginBottom: '28px',
  },
  label: {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#475569',
    marginBottom: '8px',
  },
  textarea: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid #cbd5e1',
    fontSize: '0.9rem',
    color: '#1e293b',
    outline: 'none',
    resize: 'none' as const,
    fontFamily: 'inherit',
    transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
  },
  submitButton: {
    width: '100%',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    padding: '14px 20px',
    fontSize: '0.95rem',
    fontWeight: 700,
    transition: 'background-color 0.15s ease-in-out, transform 0.1s ease',
    boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.15), 0 2px 4px -1px rgba(99, 102, 241, 0.1)',
  },
  errorIcon: {
    fontSize: '3.5rem',
    marginBottom: '20px',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 800,
    color: '#1e293b',
    margin: '0 0 12px 0',
  },
  description: {
    fontSize: '0.95rem',
    color: '#64748b',
    lineHeight: '1.6',
    margin: '0 0 24px 0',
  },
  successIcon: {
    fontSize: '3.8rem',
    marginBottom: '20px',
  },
  successBadge: {
    display: 'inline-block',
    padding: '6px 16px',
    borderRadius: '20px',
    backgroundColor: '#dcfce7',
    color: '#15803d',
    fontSize: '0.85rem',
    fontWeight: 700,
  },
};
