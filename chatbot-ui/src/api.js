// src/api.js
const USE_MOCK = false;                     // set to false when the backend exists
const API_BASE = "http://localhost:8000";

export const sessionId = crypto.randomUUID(); // identifies this chat session

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body, isForm = false) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: isForm ? {} : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// ---- mock replies (temporary, Part 2 replaces this with real logic) ----
function mockChat(text) {
  const s = text.toLowerCase();
  if (/human|agent|complaint|fraud/.test(s))
    return { reply: "Connecting you to a human agent.", escalate: true };
  if (/order|track/.test(s))
    return { reply: "Please share your order id (e.g. SE1001).", escalate: false };
  if (/refund|return/.test(s))
    return { reply: "Returns are accepted within 10 days. Refunds take 5-7 working days.", escalate: false };
  if (/payment|charged/.test(s))
    return { reply: "Failed payments are auto-refunded in 5-7 working days.", escalate: false };
  return { reply: "I'm not sure I understood. I can help with orders, payments and returns.", escalate: false };
}

// ---- the three functions the UI uses ----
export async function sendChat(text, language) {
  if (USE_MOCK) { await wait(500); return mockChat(text); }
  return post("/chat", { session_id: sessionId, text, language });
}

export async function sendImage(file, orderId) {
  if (USE_MOCK) {
    await wait(900);
    const unclear = /blur|dark/i.test(file.name);
    return unclear
      ? { findings: "The photo is too unclear to assess.", confidence: 0.4, recommended_action: "human_review" }
      : { findings: "Visible damage detected on the item.", confidence: 0.86, recommended_action: "start_replacement" };
  }
  const fd = new FormData();
  fd.append("image", file);
  fd.append("order_id", orderId || "");
  fd.append("session_id", sessionId);
  return post("/image", fd, true);
}

export async function sendFeedback(messageId, value) {
  if (USE_MOCK) return { ok: true };
  return post("/feedback", { session_id: sessionId, message_id: messageId, value });
}
export async function resumeBot() {
  if (USE_MOCK) return { ok: true };
  return post("/resume", { session_id: sessionId });
}