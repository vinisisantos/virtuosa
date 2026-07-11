import type { CSSProperties } from 'react';

export const adminCardStyle: CSSProperties = {
  background: 'var(--card-bg)',
  borderRadius: 20,
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-md)',
  padding: 24,
};

export const adminInputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  fontSize: '0.9rem',
  outline: 'none',
  background: 'var(--bg)',
  boxSizing: 'border-box',
  color: 'var(--text-main)',
  fontFamily: 'inherit',
  fontWeight: 600,
  height: 48,
};

export const adminCompactInputStyle: CSSProperties = {
  ...adminInputStyle,
  fontSize: '0.88rem',
  height: 46,
};

export const adminLabelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 700,
  color: 'var(--text-muted)',
  marginBottom: 6,
  textTransform: 'uppercase',
};
