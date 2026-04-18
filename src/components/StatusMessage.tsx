interface Props {
  type: 'loading' | 'error' | 'warning' | 'info';
  message: string;
  action?: { label: string; onClick: () => void };
}

const icons: Record<Props['type'], string> = {
  loading: '⏳',
  error: '⚠️',
  warning: '🔌',
  info: '🎹',
};

export function StatusMessage({ type, message, action }: Props) {
  return (
    <div
      className={`status-message status-message--${type}`}
      role={type === 'error' ? 'alert' : 'status'}
    >
      <span className="status-message__icon" aria-hidden="true">
        {icons[type]}
      </span>
      <div className="status-message__body">
        <p>{message}</p>
        {action && (
          <button className="status-message__action" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
