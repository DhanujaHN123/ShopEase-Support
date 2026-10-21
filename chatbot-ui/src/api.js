// src/api.js
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function getSessionId() {
  const key = "shopease-session-id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export const sessionId = getSessionId();

async function post(path, body, isForm = false) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: isForm ? {} : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// ---- the three functions the UI uses ----
export async function sendChat(text, language) {
  return post("/chat", { session_id: sessionId, text, language });
}

export async function sendImage(file, orderId) {
  const fd = new FormData();
  fd.append("image", file);
  fd.append("order_id", orderId || "");
  fd.append("session_id", sessionId);
  return post("/image", fd, true);
}

export async function sendFeedback(messageId, value) {
  return post("/feedback", { session_id: sessionId, message_id: messageId, value });
}
export async function resumeBot() {
  return post("/resume", { session_id: sessionId });
}
