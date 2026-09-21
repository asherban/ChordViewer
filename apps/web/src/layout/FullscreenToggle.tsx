import { useEffect, useId, useRef, useState } from "react";

export function FullscreenToggle() {
  const [fullscreen, setFullscreen] = useState(() =>
    Boolean(document.fullscreenElement),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const requesting = useRef(false);
  const messageId = useId();
  const supported =
    Boolean(document.fullscreenEnabled) &&
    typeof document.documentElement.requestFullscreen === "function" &&
    typeof document.exitFullscreen === "function";

  useEffect(() => {
    mounted.current = true;
    const updateFullscreen = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      setError("");
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => {
      mounted.current = false;
      document.removeEventListener("fullscreenchange", updateFullscreen);
    };
  }, []);

  async function toggle() {
    if (requesting.current) return;
    const exiting = Boolean(document.fullscreenElement);
    if (
      (!supported && !exiting) ||
      typeof document.exitFullscreen !== "function"
    )
      return;
    requesting.current = true;
    setPending(true);
    setError("");
    try {
      // Invoke directly inside the click handler so the browser keeps user activation.
      if (exiting) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      if (mounted.current)
        setError(
          exiting
            ? "Could not leave full screen. Press Esc to exit."
            : "Could not enter full screen. Try again, or check your browser's full-screen permission.",
        );
    } finally {
      requesting.current = false;
      if (mounted.current) {
        setFullscreen(Boolean(document.fullscreenElement));
        setPending(false);
      }
    }
  }

  const label = fullscreen ? "Exit full screen" : "Enter full screen";
  const unavailable = !supported && !fullscreen;
  const message =
    error ||
    (unavailable
      ? "Full screen is unavailable in this browser or page."
      : pending
        ? "Changing full-screen mode…"
        : "");
  return (
    <div className="fullscreen-control">
      <button
        type="button"
        className="fullscreen-toggle"
        aria-label={label}
        aria-pressed={fullscreen}
        aria-busy={pending}
        aria-describedby={message ? messageId : undefined}
        disabled={pending || unavailable}
        title={
          unavailable
            ? "Full screen is unavailable"
            : fullscreen
              ? "Exit full screen (Esc)"
              : label
        }
        onClick={() => void toggle()}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d={
              fullscreen
                ? "M9 3v6H3m18 0h-6V3M3 15h6v6m6 0v-6h6"
                : "M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6"
            }
          />
        </svg>
        <span className="fullscreen-label">{label}</span>
      </button>
      {message && (
        <span
          id={messageId}
          className="fullscreen-error"
          role={error ? "alert" : "status"}
        >
          {message}
        </span>
      )}
    </div>
  );
}
