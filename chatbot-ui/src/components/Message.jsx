// src/components/Message.jsx
export default function Message({ msg, onFeedback }) {
  return (
    <div className={`row ${msg.who}${msg.agent ? " agent" : ""}`}>
      <div className="bubble">
        {msg.img && <img src={msg.img} alt="Photo you sent" />}
        {msg.text}
      </div>

      {msg.who === "bot" && !msg.agent && (
        <div className="fb">
          <button
            disabled={!!msg.vote}
            className={msg.vote === "up" ? "sel" : ""}
            onClick={() => onFeedback(msg.id, "up")}
            aria-label="Helpful"
          >👍</button>
          <button
            disabled={!!msg.vote}
            className={msg.vote === "down" ? "sel" : ""}
            onClick={() => onFeedback(msg.id, "down")}
            aria-label="Not helpful"
          >👎</button>
        </div>
      )}
    </div>
  );
}