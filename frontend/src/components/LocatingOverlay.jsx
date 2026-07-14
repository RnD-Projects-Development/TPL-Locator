import React, { useState, useEffect } from 'react';
import './LocatingOverlay.css';
import tplLogo from '../assets/tpl.png';

const STATUS_MESSAGES = [
  "Locating device...",
  "Requesting latest coordinates...",
  "Synchronizing with tracking service...",
  "Almost there..."
];

export default function LocatingOverlay({ isVisible, error, onRetry }) {
  const [shouldRender, setShouldRender] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [msgIndex, setMsgIndex] = useState(0);
  const [isSlowNetwork, setIsSlowNetwork] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      setIsExiting(false);
      setMsgIndex(0);
      setIsSlowNetwork(false);
    } else if (shouldRender && !isVisible) {
      setIsExiting(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsExiting(false);
      }, 250); // Matches animation duration
      return () => clearTimeout(timer);
    }
  }, [isVisible, shouldRender]);

  useEffect(() => {
    if (!isVisible || error) return;

    // Rotate messages every 2 seconds after the first 3 seconds
    const msgTimer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 2500);

    // Flag slow network after 8 seconds
    const slowNetworkTimer = setTimeout(() => {
      setIsSlowNetwork(true);
    }, 8000);

    return () => {
      clearInterval(msgTimer);
      clearTimeout(slowNetworkTimer);
    };
  }, [isVisible, error]);

  if (!shouldRender) return null;

  return (
    <div className={`locating-overlay ${isExiting ? 'exiting' : ''}`}>
      <div className="locating-content">
        <div className="locating-logo-wrapper">
          <img src={tplLogo} alt="TPL Logo" className="locating-logo" />
        </div>

        <div className="locating-text-container">
          {error ? (
            <>
              <h3 className="locating-title">Unable to retrieve location</h3>
              <p className="locating-subtitle">{error}</p>
              <div>
                <button className="locating-retry-btn" onClick={onRetry}>
                  Retry
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="locating-title">
                {isSlowNetwork ? "Still searching for the latest location..." : STATUS_MESSAGES[msgIndex]}
              </h3>
              <p className="locating-subtitle">
                {isSlowNetwork 
                  ? "The device may be temporarily offline or experiencing a weak connection." 
                  : "Fetching the latest available location."}
              </p>
              <div className="locating-progress-track">
                <div className="locating-progress-bar" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
