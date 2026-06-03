import React from 'react'
import './Switch.css'

export default function Switch({ checked = false, onChange = () => {} }) {
  return (
    <div className="switch-wrapper">
      <label className="ui-switch">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className="slider">
          <div className="circle" />
        </div>
      </label>
    </div>
  )
}
