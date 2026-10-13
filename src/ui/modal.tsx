import React from 'react';
import { Icon } from './primitives';

/* ---------- shared modal frame ---------- */
export function ModalFrame({ title, sub, onClose, width, children, foot }: {
  title: string; sub?: React.ReactNode; onClose: () => void; width?: number; children: React.ReactNode; foot?: React.ReactNode;
}) {
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal-wrap" onClick={onClose}>
        <div className="modal" role="dialog" aria-label={title} style={width ? { width } : undefined} onClick={e => e.stopPropagation()}>
          <div className="panel-head" style={{ padding: '18px 24px' }}>
            <div>
              <h3 className="modal-title">{title}</h3>
              {sub && <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{sub}</div>}
            </div>
            <button type="button" className="cbtn" title="Close (esc)" onClick={onClose}><Icon name="close" size={16} /></button>
          </div>
          <div className="so-body">{children}</div>
          {foot && <div className="so-foot">{foot}</div>}
        </div>
      </div>
    </>
  );
}

