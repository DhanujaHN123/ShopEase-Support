// src/components/ChatInput.jsx
import { useRef } from "react";

export default function ChatInput({ value, onChange, onSubmit, voice, onPickImage }) {
  const fileRef = useRef(null); // lets the 📎 button click the hidden file input

  return (
    <form className="input-row" onSubmit={onSubmit}>
      <button
        type="button"
        className={`icon-btn${voice.listening ? " on" : ""}`}
        onClick={voice.toggle}
        disabled={!voice.supported}
        aria-label="Speak your message"
        title={voice.supported ? "Speak" : "Voice needs Chrome or Edge"}
      >🎤</button>

      <button
        type="button"
        className="icon-btn"
        onClick={() => fileRef.current.click()}
        aria-label="Attach a photo"
      >📎</button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files[0];
          if (f) onPickImage(f);
          e.target.value = ""; // allows picking the same file again
        }}
      />

      <input
        className="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type, speak or attach a photo…"
        aria-label="Your message"
      />
      <button className="send">Send</button>
    </form>
  );
}