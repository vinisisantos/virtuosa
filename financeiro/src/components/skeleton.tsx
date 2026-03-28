'use client';

interface SkeletonProps {
  variant?: 'text' | 'title' | 'avatar' | 'card' | 'chart' | 'button';
  width?: string | number;
  height?: string | number;
  count?: number;
  style?: React.CSSProperties;
}

export function Skeleton({ variant = 'text', width, height, count = 1, style }: SkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  const getClassName = () => {
    const base = 'skeleton';
    switch (variant) {
      case 'title': return `${base} skeleton-title`;
      case 'avatar': return `${base} skeleton-avatar`;
      case 'card': return `${base} skeleton-card`;
      case 'chart': return `${base} skeleton-chart`;
      case 'button': return `${base} skeleton-btn`;
      default: return `${base} skeleton-text`;
    }
  };

  return (
    <>
      {items.map(i => (
        <div
          key={i}
          className={getClassName()}
          style={{
            ...(width ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
            ...(height ? { height: typeof height === 'number' ? `${height}px` : height } : {}),
            ...style,
          }}
        />
      ))}
    </>
  );
}

/* Pre-composed skeleton layouts for common patterns */

export function SkeletonKPICards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="skeleton-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Skeleton variant="avatar" width={36} height={36} style={{ borderRadius: 10 }} />
            <Skeleton width="60%" />
          </div>
          <Skeleton variant="title" width="50%" />
          <Skeleton width="40%" height={10} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Skeleton variant="avatar" width={32} height={32} style={{ borderRadius: 8 }} />
        <Skeleton width="30%" height={16} />
        <div style={{ marginLeft: 'auto' }}>
          <Skeleton variant="button" width={60} height={24} />
        </div>
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Skeleton variant="avatar" width={38} height={38} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width={`${60 + Math.random() * 30}%`} />
            <Skeleton width={`${30 + Math.random() * 20}%`} height={10} />
          </div>
          <Skeleton variant="button" width={80} height={28} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="skeleton-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Skeleton variant="title" width="30%" />
        <Skeleton variant="button" width={80} height={24} />
      </div>
      <Skeleton variant="chart" />
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI Cards */}
      <SkeletonKPICards />
      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SkeletonChart />
        <SkeletonChart />
      </div>
      {/* Table */}
      <SkeletonTable rows={3} />
    </div>
  );
}
