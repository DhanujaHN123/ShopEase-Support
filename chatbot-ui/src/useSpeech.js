// src/useSpeech.js
import { useRef, useState } from "react";

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// Speech to text
export function useSpeechInput(lang, onInterim, onFinal) {
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  function toggle() {
    if (listening) { recRef.current.stop(); return; }

    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;      // show words while the person is still talking
    let transcript = "";

    rec.onstart = () => { setListening(true); setError(""); };
    rec.onresult = (e) => {
      transcript = Array.from(e.results).map((r) => r[0].transcript).join("");
      onInterim(transcript);        // live text appears in the input box
    };
    rec.onerror = (e) => setError(e.error);
    rec.onend = () => {
      setListening(false);
      if (transcript.trim()) onFinal(transcript.trim()); // send when they stop talking
    };

    recRef.current = rec;
    rec.start();
  }

  return { supported: !!SR, listening, error, toggle };
}

// Text to speech (read replies aloud)
export function speak(text, lang) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.speak(u);
}