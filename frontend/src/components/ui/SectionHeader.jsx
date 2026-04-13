import './SectionHeader.css';

/**
 * Consistent card/section header with title, optional subtitle, and right-side action slot.
 *
 * Props:
 *  - title:    string
 *  - subtitle: string | null
 *  - action:   ReactNode | null — right-side slot (buttons, badges, etc.)
 *  - divider:  boolean — bottom border  (default: true)
 *  - padding:  'sm' | 'md' | 'lg'  (default: 'md')
 */
export default function SectionHeader({
  title,
  subtitle,
  action,
  divider = true,
  padding = 'md',
  className = '',
}) {
  return (
    <div
      className={[
        'ui-section-header',
        divider ? 'ui-section-header--divider' : '',
        padding !== 'md' ? `ui-section-header--pad-${padding}` : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="ui-section-header__left">
        <span className="ui-section-header__title">{title}</span>
        {subtitle && (
          <span className="ui-section-header__subtitle">{subtitle}</span>
        )}
      </div>
      {action && (
        <div className="ui-section-header__action">{action}</div>
      )}
    </div>
  );
}
