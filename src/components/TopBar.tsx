import { useState, type FormEvent } from 'react';
import type { MidiStatus, MidiInputDescriptor } from '../lib/midi';
import { parseYouTubeId, parseYouTubeStart, type VideoHistoryEntry } from '../lib/youtube';

interface Props {
  midiStatus: MidiStatus | null;
  inputs: MidiInputDescriptor[];
  selectedInputId: string | null;
  onSelectInput: (id: string) => void;
  videoId: string | null;
  videoHistory: VideoHistoryEntry[];
  onLoadVideo: (id: string, startSec: number | null, label: string) => void;
  onClearVideo: () => void;
  onDeleteFromHistory: (id: string) => void;
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M23.5 6.2a3.01 3.01 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3.01 3.01 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.6 5.8a3.01 3.01 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3.01 3.01 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function MidiIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="5.5" y="5" width="2.5" height="8" rx="1" />
      <rect x="10.75" y="5" width="2.5" height="8" rx="1" />
      <rect x="16" y="5" width="2.5" height="8" rx="1" />
    </svg>
  );
}

export function TopBar({
  midiStatus,
  inputs,
  selectedInputId,
  onSelectInput,
  videoId,
  videoHistory,
  onLoadVideo,
  onClearVideo,
  onDeleteFromHistory,
}: Props) {
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [midiOpen, setMidiOpen] = useState(false);
  const [urlText, setUrlText] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  const isConnected = selectedInputId !== null;
  const hasMultipleDevices = inputs.length > 1;
  const selectedDevice = inputs.find((i) => i.id === selectedInputId);
  const midiReady = midiStatus?.kind === 'ready';
  const midiLoading = midiStatus === null;

  function handleYoutubeSubmit(e: FormEvent) {
    e.preventDefault();
    const id = parseYouTubeId(urlText);
    if (!id) {
      setUrlError('Not a valid YouTube URL');
      return;
    }
    setUrlError(null);
    onLoadVideo(id, parseYouTubeStart(urlText), urlText.trim());
    setUrlText('');
    setYoutubeOpen(false);
  }

  function handleYoutubeClose() {
    setYoutubeOpen(false);
    setUrlText('');
    setUrlError(null);
  }

  function handleMidiClick() {
    if (midiReady && hasMultipleDevices) {
      setMidiOpen(true);
    }
  }

  function getMidiTitle() {
    if (midiLoading) return 'Connecting to MIDI…';
    if (!midiReady) return 'MIDI not available';
    if (!isConnected) return inputs.length === 0 ? 'No MIDI device connected' : 'Select a MIDI device';
    return selectedDevice?.name ?? 'MIDI connected';
  }

  const midiIconClass = [
    'top-bar__icon-btn',
    isConnected ? 'top-bar__icon-btn--active' : 'top-bar__icon-btn--muted',
    midiLoading ? 'top-bar__icon-btn--loading' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header className="top-bar">
      <h1 className="top-bar__title">ChordViewer</h1>

      <div className="top-bar__actions">
        <button
          className={`top-bar__icon-btn${videoId ? ' top-bar__icon-btn--active' : ' top-bar__icon-btn--muted'}`}
          onClick={() => setYoutubeOpen(true)}
          title={videoId ? 'YouTube video loaded — click to change or clear' : 'Load YouTube video'}
          aria-label={videoId ? 'YouTube video loaded' : 'Load YouTube video'}
        >
          <YouTubeIcon />
          {videoId && <span className="top-bar__icon-dot" />}
        </button>

        <button
          className={midiIconClass}
          onClick={handleMidiClick}
          title={getMidiTitle()}
          aria-label={getMidiTitle()}
          style={{ cursor: hasMultipleDevices ? 'pointer' : 'default' }}
        >
          <MidiIcon />
        </button>
      </div>

      {youtubeOpen && (
        <div className="dialog-overlay" onClick={handleYoutubeClose}>
          <div
            className="dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="YouTube Video"
          >
            <h2 className="dialog__title">YouTube Video</h2>
            <div className="dialog__body">
              {videoId && (
                <div className="dialog__current">
                  <span className="dialog__current-label">Currently loaded</span>
                  <button
                    className="dialog__btn dialog__btn--danger"
                    onClick={() => { onClearVideo(); setYoutubeOpen(false); }}
                  >
                    Clear
                  </button>
                </div>
              )}
              <form className="dialog__form" onSubmit={handleYoutubeSubmit}>
                <input
                  type="url"
                  className="dialog__input"
                  placeholder="Paste YouTube URL"
                  value={urlText}
                  onChange={(e) => {
                    setUrlText(e.target.value);
                    if (urlError) setUrlError(null);
                  }}
                  aria-label="YouTube URL"
                  autoFocus
                />
                {urlError && <span className="dialog__error">{urlError}</span>}
                <div className="dialog__actions">
                  <button type="submit" className="dialog__btn dialog__btn--primary">
                    Load
                  </button>
                  <button type="button" className="dialog__btn" onClick={handleYoutubeClose}>
                    Cancel
                  </button>
                </div>
              </form>
              {videoHistory.length > 0 && (
                <div className="dialog__history">
                  <p className="dialog__history-title">Recent videos</p>
                  <div className="dialog__history-rows">
                    {videoHistory.map((entry) => (
                      <div key={entry.id} className="dialog__history-row">
                        <button
                          className={`dialog__option${entry.id === videoId ? ' dialog__option--selected' : ''}`}
                          title={entry.label}
                          onClick={() => {
                            onLoadVideo(entry.id, entry.startSec, entry.label);
                            setYoutubeOpen(false);
                          }}
                        >
                          {entry.title ?? entry.label}
                        </button>
                        <button
                          className="dialog__history-delete"
                          title="Remove from history"
                          aria-label="Remove from history"
                          onClick={() => onDeleteFromHistory(entry.id)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {midiOpen && (
        <div className="dialog-overlay" onClick={() => setMidiOpen(false)}>
          <div
            className="dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Select MIDI Input"
          >
            <h2 className="dialog__title">Select MIDI Input</h2>
            <div className="dialog__body">
              <div className="dialog__options">
                {inputs.map((input) => (
                  <button
                    key={input.id}
                    className={`dialog__option${selectedInputId === input.id ? ' dialog__option--selected' : ''}`}
                    onClick={() => {
                      onSelectInput(input.id);
                      setMidiOpen(false);
                    }}
                  >
                    {input.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
