import './StatusBadge.css';

const STATUS_LABELS = {
  online:   'Online',
  offline:  'Offline',
  warning:  'Low Battery',
  error:    'Error',
  live:     'Live',
  playback: 'Playback',
  dim:      'Inactive',
};

/**
 * Semantic status pill badge.
 *
 * Props:
 *  - status: 'online' | 'offline' | 'warning' | 'error' | 'live' | 'playback' | 'dim'
 *  - label:  string — overrides default status text
 *  - size:   'sm' | 'md'  (default: 'md')
 *  - dot:    boolean — show leading animated dot  (default: true)
 */
export default function StatusBadge({
  status = 'offline',
  label,
  size = 'md',
  dot = true,
  className = '',
}) {
  const text = label ?? STATUS_LABELS[status] ?? status;

  return (
    <span
      className={[
        'ui-badge',
        `ui-badge--${status}`,
        size === 'sm' ? 'ui-badge--sm' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {dot && <span className="ui-badge__dot" />}
      {text}
    </span>
  );
}
