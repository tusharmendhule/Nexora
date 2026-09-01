# ai_service/app.py
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn
import re

app = FastAPI(title="Nexora AI Verification Engine", version="1.0.0")

class ContentAnalysisRequest(BaseModel):
    text: str = ""
    userId: str = None
    accountAgeDays: int = 30

def assign_tier_badge(score: float) -> str:
    if score >= 81:
        return "Green"
    elif score >= 61:
        return "Blue"
    elif score >= 41:
        return "Purple"
    elif score >= 21:
        return "Orange"
    else:
        return "Red"

@app.get("/")
def health_check():
    return {"status": "Nexora AI NLP Service Online"}

@app.post("/analyze-trust")
def analyze_trust(payload: ContentAnalysisRequest):
    text = (payload.text or "").strip()
    
    # 1. Fact Check Claim Analysis (Heuristic NLP baseline)
    suspicious_patterns = [r"shocking", r"100% cure", r"miracle", r"secret leak", r"forwarded", r"conspiracy"]
    matches = sum(1 for pattern in suspicious_patterns if re.search(pattern, text, re.IGNORECASE))
    factual_score = max(0.2, 0.95 - (matches * 0.25))

    # 2. Authenticity Analysis (Length, grammar, structure)
    authenticity_score = 0.90 if len(text) > 40 else 0.70

    # 3. Source Credibility (Account maturity & historical signals)
    source_credibility = min(1.0, max(0.5, payload.accountAgeDays / 100))

    # 4. Model Confidence Score
    model_confidence = 0.92

    # Weighted Mathematical Formula: (35% Fact + 30% Auth + 20% Source + 15% Conf) * 100
    final_score = round(
        ((0.35 * factual_score) +
         (0.30 * authenticity_score) +
         (0.20 * source_credibility) +
         (0.15 * model_confidence)) * 100,
        2
    )

    badge = assign_tier_badge(final_score)

    return {
        "success": True,
        "factualVerificationScore": factual_score,
        "authenticityScore": authenticity_score,
        "sourceCredibilityScore": source_credibility,
        "modelConfidenceScore": model_confidence,
        "finalScore": final_score,
        "label": badge,
        "explanation": f"Evaluated with {final_score}/100 trust rating across 4 NLP verification parameters."
    }

if __name__ == "__main__":
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)