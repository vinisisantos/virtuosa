import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface AdminPageHeaderProps {
  title: ReactNode;
  description: string;
  icon?: string;
  action?: ReactNode;
}

export function AdminPageHeader({ title, description, icon, action }: AdminPageHeaderProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, ...(icon ? { display: 'flex', alignItems: 'center', gap: 10 } : {}) }}>
          {icon && <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>{icon}</span>}
          {title}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{description}</p>
      </div>
      {action}
    </div>
  );
}

interface AdminPrimaryActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
}

export function AdminPrimaryAction({ icon, children, style, ...props }: AdminPrimaryActionProps) {
  return (
    <button
      {...props}
      style={{
        padding: '12px 24px', borderRadius: 14, border: 'none',
        background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
        color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8,
        ...style,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>
      {children}
    </button>
  );
}

export interface AdminKpi {
  icon: string;
  color: string;
  label: string;
  value: ReactNode;
}

interface AdminKpiGridProps {
  items: AdminKpi[];
  variant?: 'compact' | 'spacious';
  minWidth?: number;
  tourId?: string;
}

export function AdminKpiGrid({ items, variant = 'compact', minWidth = 180, tourId }: AdminKpiGridProps) {
  const spacious = variant === 'spacious';
  return (
    <div
      data-tour={tourId}
      style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: 14, marginBottom: 24 }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)', padding: spacious ? '18px 22px' : '16px 20px',
            display: 'flex', alignItems: 'center', gap: spacious ? 14 : 12,
          }}
        >
          <div style={{
            width: spacious ? 44 : 40, height: spacious ? 44 : 40,
            borderRadius: spacious ? 12 : 10, background: `${item.color}12`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: spacious ? 22 : 20, color: item.color }}>{item.icon}</span>
          </div>
          <div>
            <div style={{
              fontSize: spacious ? '0.68rem' : '0.65rem', fontWeight: 600,
              color: 'var(--text-muted)', textTransform: 'uppercase',
            }}>{item.label}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, ...(spacious ? { color: 'var(--text-main)' } : {}) }}>{item.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
