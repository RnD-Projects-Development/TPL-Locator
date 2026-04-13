import './Card.css';

/**
 * Base card wrapper. Use as a building block for all panel/card UIs.
 *
 * Props:
 *  - padding: 'none' | 'sm' | 'md' | 'lg'  (default: 'none')
 *  - hover:   boolean — enables lift-on-hover (default: true)
 *  - noBorder:boolean — removes border (default: false)
 *  - as:      element tag string (default: 'div')
 */
export default function Card({
  children,
  className = '',
  padding = 'none',
  hover = true,
  noBorder = false,
  as: Tag = 'div',
  style,
  ...rest
}) {
  const classes = [
    'ui-card',
    hover    ? 'ui-card--hover'     : '',
    noBorder ? 'ui-card--no-border' : '',
    padding !== 'none' ? `ui-card--pad-${padding}` : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <Tag className={classes} style={style} {...rest}>
      {children}
    </Tag>
  );
}
