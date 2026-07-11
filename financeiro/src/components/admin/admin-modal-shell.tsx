import type { CSSProperties, ReactNode } from 'react';

interface AdminModalShellProps {
  children: ReactNode;
  onClose: () => void;
  maxWidth?: CSSProperties['maxWidth'];
  cardPadding?: CSSProperties['padding'];
  maxHeight?: CSSProperties['maxHeight'];
  cardStyle?: CSSProperties;
}

export function AdminModalShell({
  children,
  onClose,
  maxWidth = 500,
  cardPadding = 28,
  maxHeight,
  cardStyle,
}: AdminModalShellProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
        alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(8px)', padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)', maxWidth, width: '100%', padding: cardPadding,
          maxHeight, ...cardStyle,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
