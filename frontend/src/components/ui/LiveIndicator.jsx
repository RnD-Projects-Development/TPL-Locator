import { useState, useEffect, useRef } from 'react';
import './LiveIndicator.css';

function getTimeAgo(date) {
  if (!date) return null;
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 5)  return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

/**
 * "Live" indicator with animated dot and last-updated timestamp.
 *
 * Props:
 *  - lastUpdated: Date | null — timestamp of last successful fetch
 *  - loading:     boolean — shows spinning ring while fetching
 *  - size:        'sm' | 'md'  (default: 'md')
 */
export default function LiveIndicator({
  lastUpdated = null,
  loading = false,
  size = 'md',
  className = '',
}) {
  const [timeAgo, setTimeAgo] = useState(() => getTimeAgo(lastUpdated));
  const timerRef = useRef(null);

  useEffect(() => {
    setTimeAgo(getTimeAgo(lastUpdated));
    timerRef.current = setInterval(() => {
      setTimeAgo(getTimeAgo(lastUpdated));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [lastUpdated]);

  return (
    <span className={`ui-live ${className}`}>
      {loading
        ? <span className="ui-live__ring" />
        : <span className="ui-live__dot ui-live__dot--pulse" />
      }
      <span className={`ui-live__label${loading ? ' ui-live__label--loading' : ''}`}>
        {loading ? 'Refreshing…' : 'Live'}
      </span>
      {!loading && timeAgo && (
        <span className="ui-live__time">· {timeAgo}</span>
      )}
    </span>
  );
}
