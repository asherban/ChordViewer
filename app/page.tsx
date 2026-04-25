export default function LandingPage() {
  return (
    <main className="landing">
      <h1 className="landing__title">ChordViewer</h1>
      <p className="landing__desc">
        Real-time MIDI chord identification and lead sheet transcription for pianists.
      </p>
      <div className="landing__actions">
        <a href="/app" className="landing__btn landing__btn--primary">
          Open App
        </a>
      </div>
    </main>
  )
}
