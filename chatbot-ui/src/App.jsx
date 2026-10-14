// src/App.jsx
import { useEffect, useRef, useState } from "react";
import Message from "./components/Message";
import ChatInput from "./components/ChatInput";
import { sendChat, sendImage, sendFeedback, resumeBot } from "./api";
import { useSpeechInput, speak } from "./useSpeech";
import "./App.css";

const LANGS = [["en-IN", "English"], ["hi-IN", "Hindi"], ["kn-IN", "Kannada"], ["ta-IN", "Tamil"]];
const CHIPS = ["Where is my order?", "I want a refund", "Payment failed", "Talk to a human"];

export default function App() {
  // ---- state: anything that changes what the screen shows ----
  const [messages, setMessages] = useState([
    { id: 0, who: "bot", text: "Hi, I'm the ShopEase assistant. Ask about orders, payments, returns or your account. You can also speak or attach a photo of a damaged item." },
  ]);
  const [input, setInput] = useState("");        // text box contents
  const [loading, setLoading] = useState(false); // show "Typing…"
  const [human, setHuman] = useState(false);     // handed over to a human?
  const [lang, setLang] = useState("en-IN");
  const [readAloud, setReadAloud] = useState(false);
  const [image, setImage] = useState(null);      // { file, url } waiting to be sent
  const [orderId, setOrderId] = useState("");

  const nextId = useRef(1);       // counter for message ids (not shown on screen)
  const bottomRef = useRef(null); // invisible div at the end of the chat

  // auto-scroll whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ---- helpers ----
  function addMessage(m) {
    setMessages((prev) => [...prev, { id: nextId.current++, ...m }]);
    if (m.who === "bot" && readAloud) speak(m.text, lang);
  }

  async function sendText(text) {
    setInput("");  
    addMessage({ who: "me", text });
    setLoading(true);
    try {
      const r = await sendChat(text, lang);
      addMessage({ who: "bot", text: r.reply, agent: human || r.escalate });
      if (r.escalate) setHuman(true);
    } catch {
      addMessage({ who: "bot", text: "Sorry, I can't reach the support server right now. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  async function sendPhoto(img, text) {
    addMessage({ who: "me", text, img: img.url });
    setLoading(true);
    try {
      const r = await sendImage(img.file, orderId.trim());
      const pct = Math.round(r.confidence * 100);
      if (r.confidence < 0.6 || r.recommended_action === "human_review") {
        addMessage({ who: "bot", text: `${r.findings} (confidence ${pct}%). I'll pass this to a human agent to review.` });
        setHuman(true);
      } else {
        addMessage({ who: "bot", text: `${r.findings} (confidence ${pct}%).\nNext step: ${r.recommended_action.replace(/_/g, " ")}.` });
      }
    } catch {
      addMessage({ who: "bot", text: "Sorry, I couldn't analyse the photo. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();                 // stop the page from reloading
    const text = input.trim();
    if (!text && !image) return;
    setInput("");
    if (image) { const img = image; setImage(null); sendPhoto(img, text); }
    else sendText(text);
  }

  function handlePickImage(file) {
    if (file.size > 5 * 1024 * 1024) {
      addMessage({ who: "bot", text: "Please choose an image under 5 MB." });
      return;
    }
    setImage({ file, url: URL.createObjectURL(file) });
  }

  function handleFeedback(id, value) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, vote: value } : m)));
    sendFeedback(id, value).catch(() => {});
  }

  async function backToBot() {
  try {
    await resumeBot();
    setHuman(false);
    addMessage({ who: "bot", text: "You're back with the assistant. How can I help?" });
  } catch {
    addMessage({ who: "bot", text: "Sorry, I couldn't switch back right now. Please try again." });
  }
}

  const voice = useSpeechInput(lang, setInput, sendText);

  // ---- what gets drawn ----
  return (
    <div className="app">
      <section className="chat" aria-label="Customer support chat">
        <header>
          <h1>ShopEase Support</h1>
          <span className="status">
            <span className={`dot${human ? " h" : ""}`} />
            {human ? "Human agent" : "Assistant"}
          </span>
        </header>

        {human && (
  <div className="banner">
    <span>You are chatting with a human agent. Please wait a moment.</span>
    <button className="banner-btn" onClick={backToBot}>Back to assistant</button>
  </div>
)}

        <div className="log" role="log" aria-live="polite">
          {messages.map((m) => (
            <Message key={m.id} msg={m} onFeedback={handleFeedback} />
          ))}
          {loading && <div className="typing">Typing…</div>}
          <div ref={bottomRef} />
        </div>

        {messages.length === 1 && (
          <div className="chips">
            {CHIPS.map((c) => (
              <button key={c} className="chip" onClick={() => sendText(c)}>{c}</button>
            ))}
          </div>
        )}

        <div className="tools">
          <label>
            Language{" "}
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} /> Read aloud
          </label>
          {voice.listening && <span>Listening…</span>}
          {voice.error && <span className="err">Voice error: {voice.error}</span>}
        </div>

        {image && (
          <div className="preview">
            <img src={image.url} alt="Selected photo preview" />
            <label>Order id <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="SE1001" size="8" /></label>
            <button className="chip" onClick={() => setImage(null)}>Remove</button>
          </div>
        )}

        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          voice={voice}
          onPickImage={handlePickImage}
        />
      </section>
    </div>
  );
}