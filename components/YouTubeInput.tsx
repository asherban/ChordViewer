'use client'

import { useState, type FormEvent } from 'react';
import { parseYouTubeId, parseYouTubeStart } from '../lib/youtube';

interface Props {
  videoId: string | null;
  onLoad: (id: string, startSec: number | null) => void;
  onClear: () => void;
}

export function YouTubeInput({ videoId, onLoad, onClear }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = parseYouTubeId(text);
    if (!id) {
      setError('Not a valid YouTube URL');
      return;
    }
    setError(null);
    onLoad(id, parseYouTubeStart(text));
    setText('');
  };

  if (videoId) {
    return (
      <div className="youtube-input">
        <span className="youtube-input__label">YouTube video loaded</span>
        <button
          type="button"
          className="youtube-input__btn youtube-input__btn--clear"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <form className="youtube-input" onSubmit={submit}>
      <input
        type="url"
        className="youtube-input__field"
        placeholder="Paste YouTube URL"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
        aria-label="YouTube URL"
      />
      <button type="submit" className="youtube-input__btn">
        Load
      </button>
      {error && <span className="youtube-input__error">{error}</span>}
    </form>
  );
}
