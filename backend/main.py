# backend/main.py
import json
import os
import random
import re
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel

load_dotenv()
FAQ = json.loads((Path(__file__).parent / "faq.json").read_text(encoding="utf-8"))
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY")) if os.getenv("GEMINI_API_KEY") else None

# Tried in this order. If one is overloaded (503), over quota (429) or unavailable, the next is used.
MODELS = [
   "gemini-3.6-flash",       # working for you right now
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
]
COOLDOWN: dict[str, float] = {} 
print("Chat models that will be tried:", MODELS)

app = FastAPI(title="ShopEase Chatbot API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"])

# Demo order database (Part 4 replaces this with a real one)
ORDERS = {
    "SE1001": {"status": "Shipped", "carrier": "BlueDart", "tracking": "BD88213", "expected_delivery": "3 Oct 2026"},
    "SE1002": {"status": "Delivered", "carrier": "Delhivery", "tracking": "DL4410", "delivered_on": "28 Sep 2026"},
    "SE1003": {"status": "Processing", "expected_delivery": "6 Oct 2026"},
}
LANG_NAMES = {"en-IN": "English", "hi-IN": "Hindi", "kn-IN": "Kannada", "ta-IN": "Tamil"}

HISTORY: dict[str, list] = {}   # session_id -> list of {"role", "content"}
ESCALATED: set[str] = set()     # sessions handed to a human


class ChatIn(BaseModel):
    session_id: str
    text: str
    language: str = "en-IN"


class FeedbackIn(BaseModel):
    session_id: str
    message_id: int
    value: str

class ResumeIn(BaseModel):
    session_id: str


def order_context(session_id: str, text: str) -> str:
    """Look for an order id in this message or earlier ones, so customers needn't repeat it."""
    texts = [m["content"] for m in HISTORY.get(session_id, []) if m["role"] == "user"] + [text]
    for t in reversed(texts):
        found = re.search(r"SE\d{4}", t.upper())
        if found:
            oid = found.group(0)
            order = ORDERS.get(oid)
            return f"{oid}: {json.dumps(order)}" if order else f"{oid}: NOT FOUND in our system"
    return "No order id given yet."


def build_system(language: str, order_info: str) -> str:
    faq_text = "\n".join(f"[{f['category']}] Q: {f['q']}\nA: {f['a']}" for f in FAQ["faqs"])
    default_lang = LANG_NAMES.get(language, "English")
    return f"""You are the customer support assistant for {FAQ['company']}.
Answer ONLY from the FAQ and ORDER DATA below. If the answer is not there, say you are not sure and offer a human agent. Never invent policies, prices or order details.
Reply in the language the customer writes in. If they write Kannada, Hindi or Tamil in English letters, reply in the same style (English letters). If unclear, use {default_lang}. Keep replies short (max 3 sentences) and polite.
Set escalate to true ONLY if the customer asks for a human, is angry or frustrated, mentions fraud, legal action or a safety issue, or has told you twice that your answers are not helping.
If you do not know the answer, set escalate to false, say you are not sure, and offer to connect them to a human agent if they want one.
Respond with ONLY a JSON object and nothing else:
{{"reply": "...", "intent": "short_snake_case", "category": "Orders | Payments | Returns & refunds | Account | Product info | Technical issues | General | Escalation | Unknown", "sentiment": "positive | neutral | negative", "escalate": true or false}}

FAQ:
{faq_text}

ORDER DATA:
{order_info}
"""


def parse_json(raw: str) -> dict:
    start, end = raw.find("{"), raw.rfind("}")
    return json.loads(raw[start:end + 1])


def call_gemini(contents, system):
    """One try per model. A failed model is skipped for a while, so later messages are fast."""
    last_error = None
    now = time.time()
    ready = [m for m in MODELS if COOLDOWN.get(m, 0) <= now]
    order = ready or MODELS          # if every model is cooling down, try them all anyway
    for model in order:
        try:
            t0 = time.time()
            resp = client.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    max_output_tokens=1000,
                ),
            )
            print(f"Answered by {model} in {time.time() - t0:.1f}s")
            return resp
        except Exception as e:
            last_error = e
            msg = str(e)
            print(f"AI error [{model}]:", msg[:120])
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                COOLDOWN[model] = time.time() + 300    # out of quota: skip for 5 minutes
            elif "503" in msg or "UNAVAILABLE" in msg:
                COOLDOWN[model] = time.time() + 60     # overloaded: skip for 1 minute
            elif "404" in msg or "NOT_FOUND" in msg:
                COOLDOWN[model] = time.time() + 3600   # not available to this key: skip for an hour
    raise last_error


def keyword_fallback(text: str) -> dict:
    """Used only when no API key is set."""
    if re.search(r"human|agent|complaint|fraud|legal", text.lower()):
        return dict(reply="Connecting you to a human agent.", intent="human_request", category="Escalation", sentiment="neutral", escalate=True)
    return dict(reply="The AI service is not configured. Please add GEMINI_API_KEY to the .env file.", intent="fallback", category="Unknown", sentiment="neutral", escalate=False)


@app.get("/health")
def health():
    return {"status": "ok", "claude_enabled": client is not None, "models": MODELS}


@app.post("/chat")
def chat(body: ChatIn):
    sid = body.session_id
    if sid in ESCALATED:
        return dict(reply="An agent will reply here shortly.", intent="waiting", category="Escalation", sentiment="neutral", escalate=True)
    if client is None:
        return keyword_fallback(body.text)

    history = HISTORY.setdefault(sid, [])
    turns = history[-10:] + [{"role": "user", "content": body.text}]
    contents = [
        types.Content(
            role="model" if t["role"] == "assistant" else "user",
            parts=[types.Part(text=t["content"])],
        )
        for t in turns
    ]
    try:
        resp = call_gemini(contents, build_system(body.language, order_context(sid, body.text)))
        data = parse_json(resp.text)
    except Exception as e:
        print("AI error (giving up):", str(e)[:300])
        return dict(reply="Sorry, something went wrong on our side. Please try again.", intent="error", category="Unknown", sentiment="neutral", escalate=False)

    history.append({"role": "user", "content": body.text})
    history.append({"role": "assistant", "content": data["reply"]})

    if data.get("escalate"):
        ESCALATED.add(sid)
        data["reply"] += f"\n(Ticket #{random.randint(10000, 99999)})"
    return data


# ---- kept so Part 1 keeps working; Part 3 will upgrade /image ----
@app.post("/image")
async def image(image: UploadFile = File(...), order_id: str = Form(""), session_id: str = Form("")):
    data = await image.read()
    if len(data) < 5000:
        return dict(findings="The photo is too unclear to assess.", confidence=0.4, recommended_action="human_review")
    return dict(findings="Visible damage detected on the item.", confidence=0.86, recommended_action="start_replacement")


@app.post("/feedback")
def feedback(body: FeedbackIn):
    print("feedback:", body)
    return {"ok": True}
@app.post("/resume")
def resume(body: ResumeIn):
    """Hand the chat back to the bot (e.g. the agent finished or the customer wants the assistant)."""
    ESCALATED.discard(body.session_id)
    return {"ok": True}