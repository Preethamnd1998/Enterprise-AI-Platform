:host ::ng-deep .__PREFIX__-help-dialog {
  .p-dialog-header {
    background: linear-gradient(135deg, #0f766e 0%, #0369a1 100%);
    padding: 1.1rem 1.5rem;

    .p-dialog-header-icon {
      color: #fff;

      &:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
      }
    }
  }

  .p-dialog-content {
    padding: 0;
  }
}

.__PREFIX__-help-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.__PREFIX__-help-title {
  color: #fff;
  font-weight: 600;
  font-size: 1.05rem;
  line-height: 1.3;
}

.__PREFIX__-help-subtitle {
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.75rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.__PREFIX__-help-body {
  max-height: 65vh;
  overflow-y: auto;
  padding: 1.25rem 1.5rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.__PREFIX__-help-section {
  background: var(--surface-card, #fff);
  border: 1px solid var(--surface-border, #e2e8f0);
  border-radius: 10px;
  padding: 0.9rem 1.1rem 1rem;

  h4 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.6rem;
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--text-color, #1e293b);
  }

  p,
  ul,
  ol {
    margin: 0;
  }

  ul,
  ol {
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  li {
    line-height: 1.45;
  }
}

.__PREFIX__-help-rules {
  background: #fffbeb;
  border-color: #fde68a;
}

.__PREFIX__-help-notes {
  background: #fef2f2;
  border-color: #fecaca;
}

.__PREFIX__-help-field {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.4rem 0;

  & + .__PREFIX__-help-field {
    border-top: 1px dashed var(--surface-border, #e2e8f0);
  }
}

.__PREFIX__-help-field-name {
  font-weight: 600;
  font-size: 0.85rem;
  color: #0f766e;
}

.__PREFIX__-help-field-desc {
  font-size: 0.85rem;
  color: var(--text-color-secondary, #64748b);
  line-height: 1.4;
}
