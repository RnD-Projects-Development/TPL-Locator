import './Skeleton.css';

/**
 * Animated shimmer loading placeholder.
 *
 * Props:
 *  - width:        CSS string (default: '100%')
 *  - height:       CSS string (default: '16px')
 *  - borderRadius: CSS string (default: 'var(--radius-sm)')
 *  - count:        number — renders N stacked skeletons (default: 1)
 *  - gap:          CSS string — gap between stacked items (default: '8px')
 */
export default function Skeleton({
  width = '100%',
  height = '16px',
  borderRadius = 'var(--radius-sm)',
  count = 1,
  gap = '8px',
  className = '',
  style,
}) {
  const itemStyle = { width, height, borderRadius, ...style };

  if (count === 1) {
    return (
      <span
        className={`ui-skeleton ${className}`}
        style={itemStyle}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className="ui-skeleton-stack"
      style={{ gap }}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`ui-skeleton ${className}`}
          style={itemStyle}
        />
      ))}
    </div>
  );
}
