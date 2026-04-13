import Skeleton from './Skeleton';
import './StatCard.css';

/**
 * Metric/KPI stat card with icon, big number, trend, and optional progress bar.
 *
 * Props:
 *  - title:       string — uppercase label
 *  - value:       string | number — large metric
 *  - loading:     boolean — show skeleton shimmer
 *  - accentColor: CSS color — left bar + value color
 *  - icon:        ReactNode
 *  - iconBg:      CSS color — icon container background
 *  - iconColor:   CSS color — icon stroke/fill (passed via style to children)
 *  - trend:       { direction: 'up'|'down', label: string } | null
 *  - subtitle:    string | null
 *  - progress:    0–100 | null
 *  - className:   string passthrough
 */
export default function StatCard({
  title,
  value,
  loading = false,
  accentColor,
  icon,
  iconBg,
  iconColor,
  trend,
  subtitle,
  progress,
  className = '',
}) {
  return (
    <div className={`ui-stat-card${loading ? ' ui-stat-card--loading' : ''} ${className}`}>
      {/* Left accent bar */}
      {accentColor && (
        <span
          className="ui-stat-card__accent"
          style={{ background: accentColor }}
        />
      )}

      {/* Icon + Title row */}
      <div className="ui-stat-card__top">
        {icon && (
          <span
            className="ui-stat-card__icon"
            style={{ background: iconBg, color: iconColor }}
          >
            {icon}
          </span>
        )}
        <span className="ui-stat-card__title">{title}</span>
        {trend && (
          <span className={`ui-stat-card__trend ui-stat-card__trend--${trend.direction}`}>
            {trend.direction === 'up' ? '↑' : '↓'} {trend.label}
          </span>
        )}
      </div>

      {/* Main value */}
      {loading
        ? <Skeleton height="32px" width="60%" />
        : (
          <span
            className="ui-stat-card__value"
            style={{ color: accentColor ?? 'var(--text-primary)' }}
          >
            {value ?? '—'}
          </span>
        )
      }

      {/* Subtitle */}
      {subtitle && !loading && (
        <span className="ui-stat-card__subtitle">{subtitle}</span>
      )}

      {/* Progress bar */}
      {progress != null && (
        <div className="ui-stat-card__progress-wrap">
          <div
            className="ui-stat-card__progress-fill"
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              background: accentColor ?? 'var(--brand)',
            }}
          />
        </div>
      )}
    </div>
  );
}
