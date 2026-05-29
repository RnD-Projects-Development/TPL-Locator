import React from 'react';
import tplLogo from '../assets/tpl.png';
import { ThemeContext } from './layout/Layout.jsx';

/**
 * Shared TPL branded loading spinner.
 * Theme-aware:
 *   • Dark theme  → white logo.
 *   • Light theme → black logo, so it stays visible on light backgrounds.
 * Logo animation only — no text label in either theme.
 * Always horizontally + vertically centered within its box.
 *
 * Props:
 *   label   – accepted for backwards compatibility but no longer rendered.
 *   overlay – when true, renders as a full-cover absolutely-positioned overlay
 *             (parent must be position:relative/absolute). Used on map pages so
 *             the loader sits over the map without removing it from the DOM.
 */
const TPLLoader = ({ label = 'Loading…', overlay = false }) => {
  const isLight = React.useContext(ThemeContext) === 'light';

  const content = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      // Non-overlay: fill a tall area so the mark sits in the vertical center
      // of the page, not just padded from the top.
      minHeight: overlay ? undefined : '60vh',
      padding: overlay ? 0 : '40px 20px',
      gap: 20,
    }}>
      <style>{`
        @keyframes tpl-pulse {
          0%   { opacity: 0.15; transform: scale(0.95); }
          50%  { opacity: 0.70; transform: scale(1.02); }
          100% { opacity: 0.15; transform: scale(0.95); }
        }
      `}</style>
      <img
        src={tplLogo}
        alt="Loading"
        style={{
          width: 110,
          height: 'auto',
          // Light → black glyph so it reads on the light gradient.
          // Dark  → white glyph.
          filter: isLight ? 'brightness(0)' : 'brightness(0) invert(1)',
          animation: 'tpl-pulse 1.6s ease-in-out infinite',
        }}
      />
    </div>
  );

  if (!overlay) return content;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      // Light → soft white scrim so the black mark stays readable over the map.
      // Dark  → dim black scrim.
      background: isLight ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(3px)',
      WebkitBackdropFilter: 'blur(3px)',
      pointerEvents: 'none',
    }}>
      {content}
    </div>
  );
};

export default TPLLoader;
