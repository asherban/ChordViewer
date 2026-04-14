interface Props {
  type: 'loading' | 'error' | 'warning' | 'info';
  message: string;
}

const icons: Record<Props['type'], string> = {
  loading: '⏳',
  error: '⚠️',
  warning: '🔌',
  info: '🎹',
};

export function StatusMessage({ type, message }: Props) {
  return (
    <div
      className={`status-message status-message--${type}`}
      role={type === 'error' ? 'alert' : 'status'}
    >
      <span className="status-message__icon" aria-hidden="true">
        {icons[type]}
      </span>
      <p>{message}</p>
    </div>
  );
}
