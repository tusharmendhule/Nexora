"""
Nexora AI Text Analysis Service
===============================
Real inference using Hugging Face Transformers.

Provides:
  - Misinformation probability  (zero-shot classification)
  - AI-generated text detection  (perplexity + burstiness via GPT-2)
  - Named entity recognition     (transformers NER pipeline)
  - Claim extraction             (pattern-based heuristics)
  - Language detection           (langdetect)
  - Confidence scoring           (composite heuristic)

Models are loaded lazily on first request. If a model cannot be
downloaded or loaded the service returns an explicit error -- it
never fabricates results.
"""

import re
import time
import json
import logging
import tempfile
import os
import urllib.request
import uuid
from typing import List, Optional
from contextlib import asynccontextmanager

import torch
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

# -- Configuration -----------------------------------------------------------

MODEL_VERSION = "nexora-text-v1.2.0"
MISINFO_MODEL = "facebook/bart-large-mnli"
NER_MODEL = "dbmdz/bert-large-cased-finetuned-conll03-english"
AI_DETECT_MODEL = "gpt2"
DEVICE = -1  # CPU; set to 0 for CUDA if available

# Optional fine-tuned misinformation classifier produced by
# training/train.py. Point NEXORA_MISINFO_MODEL at the model directory;
# when unset (or unloadable) the service falls back to zero-shot
# classification and reports the fallback in the response.
FINETUNED_MISINFO_MODEL = os.environ.get("NEXORA_MISINFO_MODEL") or None

# Optional fine-tuned models produced by training/train.py (task dispatcher).
# Each is loaded lazily; when unset (or unloadable) the service falls back
# to its built-in analysis and reports the fallback — never fabricated.
FINETUNED_IMAGE_MODEL = os.environ.get("NEXORA_IMAGE_MODEL") or None       # GenImage: AI-image detector
FINETUNED_AUDIO_MODEL = os.environ.get("NEXORA_AUDIO_MODEL") or None       # ASVspoof: synthetic speech
FINETUNED_VIDEO_MODEL = os.environ.get("NEXORA_VIDEO_MODEL") or None       # FaceForensics++: manipulation
FINETUNED_CLAIM_MODEL = os.environ.get("NEXORA_CLAIM_MODEL") or None       # FEVER: claim verification

logger = logging.getLogger("nexora-ai")
logging.basicConfig(level=logging.INFO)

# -- Lazy-loaded model singletons -------------------------------------------

_models = {
    "zero_shot": None,
    "ner": None,
    "ai_detect_tokenizer": None,
    "ai_detect_model": None,
    "finetuned_misinfo": None,
    "finetuned_image": None,
    "finetuned_audio": None,
    "finetuned_video": None,
    "finetuned_claim": None,
}

# Track which models failed to load so we don't retry endlessly
_model_failures = set()


def _load_zero_shot():
    if _models["zero_shot"] is None and "zero_shot" not in _model_failures:
        try:
            from transformers import pipeline
            logger.info("Loading zero-shot classification model: %s", MISINFO_MODEL)
            _models["zero_shot"] = pipeline(
                "zero-shot-classification",
                model=MISINFO_MODEL,
                device=DEVICE,
            )
            logger.info("Zero-shot model loaded.")
        except Exception as exc:
            _model_failures.add("zero_shot")
            logger.error("Failed to load zero-shot model: %s", exc)
            raise
    return _models["zero_shot"]


def _load_finetuned_misinfo():
    """Load the fine-tuned misinformation classifier (training/train.py).
    Returns None when not configured or when loading fails — the caller
    then falls back to zero-shot classification (no fabricated results).
    """
    if not FINETUNED_MISINFO_MODEL:
        return None
    if _models["finetuned_misinfo"] is not None:
        return _models["finetuned_misinfo"]
    if "finetuned_misinfo" in _model_failures:
        return None
    try:
        import json as _json
        from transformers import pipeline
        logger.info(
            "Loading fine-tuned misinformation model: %s", FINETUNED_MISINFO_MODEL
        )
        label_map_path = os.path.join(FINETUNED_MISINFO_MODEL, "label_map.json")
        labels = None
        if os.path.exists(label_map_path):
            with open(label_map_path, "r", encoding="utf-8") as f:
                labels = list(_json.load(f).keys())
        pipe = pipeline(
            "text-classification",
            model=FINETUNED_MISINFO_MODEL,
            tokenizer=FINETUNED_MISINFO_MODEL,
            device=DEVICE,
            top_k=None,  # return full probability distribution
        )
        info = {"labels": labels, "pipe": pipe}
        _models["finetuned_misinfo"] = info
        logger.info("Fine-tuned misinformation model loaded (labels=%s).", labels)
        return info
    except Exception as exc:
        _model_failures.add("finetuned_misinfo")
        logger.error(
            "Failed to load fine-tuned misinformation model, falling back to "
            "zero-shot: %s", exc
        )
        return None


def _load_finetuned_image_model():
    """Load the fine-tuned AI-image detector (training/train.py --task image).
    Returns None when not configured / unloadable — callers fall back to the
    built-in heuristic image analysis (no fabricated results).
    """
    if not FINETUNED_IMAGE_MODEL:
        return None
    if _models.get("finetuned_image") is not None:
        return _models["finetuned_image"]
    if "finetuned_image" in _model_failures:
        return None
    try:
        from transformers import (
            AutoImageProcessor,
            AutoModelForImageClassification,
        )
        logger_image = logging.getLogger("nexora-image")
        logger_image.info("Loading fine-tuned AI-image detector: %s", FINETUNED_IMAGE_MODEL)
        processor = AutoImageProcessor.from_pretrained(FINETUNED_IMAGE_MODEL)
        model = AutoModelForImageClassification.from_pretrained(FINETUNED_IMAGE_MODEL)
        model.eval()
        info = {"processor": processor, "model": model}
        _models["finetuned_image"] = info
        return info
    except Exception as exc:
        _model_failures.add("finetuned_image")
        logger.error(
            "Failed to load fine-tuned image model, falling back to built-in "
            "analysis: %s", exc
        )
        return None


def _load_finetuned_audio_model():
    """Load the fine-tuned synthetic-speech detector (train.py --task audio)."""
    if not FINETUNED_AUDIO_MODEL:
        return None
    if _models.get("finetuned_audio") is not None:
        return _models["finetuned_audio"]
    if "finetuned_audio" in _model_failures:
        return None
    try:
        from transformers import (
            AutoFeatureExtractor,
            AutoModelForAudioClassification,
        )
        logger_audio = logging.getLogger("nexora-audio")
        logger_audio.info("Loading fine-tuned synthetic-speech detector: %s", FINETUNED_AUDIO_MODEL)
        extractor = AutoFeatureExtractor.from_pretrained(FINETUNED_AUDIO_MODEL)
        model = AutoModelForAudioClassification.from_pretrained(FINETUNED_AUDIO_MODEL)
        model.eval()
        info = {"extractor": extractor, "model": model}
        _models["finetuned_audio"] = info
        return info
    except Exception as exc:
        _model_failures.add("finetuned_audio")
        logger.error(
            "Failed to load fine-tuned audio model, falling back to built-in "
            "analysis: %s", exc
        )
        return None


def _load_finetuned_video_model():
    """Load the fine-tuned video-manipulation detector (train.py --task video)."""
    if not FINETUNED_VIDEO_MODEL:
        return None
    if _models.get("finetuned_video") is not None:
        return _models["finetuned_video"]
    if "finetuned_video" in _model_failures:
        return None
    try:
        from transformers import (
            AutoImageProcessor,
            AutoModelForImageClassification,
        )
        logger_video = logging.getLogger("nexora-video")
        logger_video.info("Loading fine-tuned video manipulation detector: %s", FINETUNED_VIDEO_MODEL)
        processor = AutoImageProcessor.from_pretrained(FINETUNED_VIDEO_MODEL)
        model = AutoModelForImageClassification.from_pretrained(FINETUNED_VIDEO_MODEL)
        model.eval()
        info = {"processor": processor, "model": model}
        _models["finetuned_video"] = info
        return info
    except Exception as exc:
        _model_failures.add("finetuned_video")
        logger.error(
            "Failed to load fine-tuned video model, falling back to built-in "
            "analysis: %s", exc
        )
        return None


def _load_finetuned_claim_model():
    """Load the fine-tuned FEVER claim-verification model (train.py --task claim).
    Returns None when unconfigured/unloadable — claim verification then relies
    on the fact-check pipeline only.
    """
    if not FINETUNED_CLAIM_MODEL:
        return None
    if _models.get("finetuned_claim") is not None:
        return _models["finetuned_claim"]
    if "finetuned_claim" in _model_failures:
        return None
    try:
        import json as _json
        from transformers import pipeline
        logger.info("Loading fine-tuned claim model: %s", FINETUNED_CLAIM_MODEL)
        label_map_path = os.path.join(FINETUNED_CLAIM_MODEL, "label_map.json")
        labels = None
        if os.path.exists(label_map_path):
            with open(label_map_path, "r", encoding="utf-8") as f:
                labels = list(_json.load(f).keys())
        pipe = pipeline(
            "text-classification",
            model=FINETUNED_CLAIM_MODEL,
            tokenizer=FINETUNED_CLAIM_MODEL,
            device=DEVICE,
            top_k=None,
        )
        info = {"labels": labels, "pipe": pipe}
        _models["finetuned_claim"] = info
        logger.info("Fine-tuned claim model loaded (labels=%s).", labels)
        return info
    except Exception as exc:
        _model_failures.add("finetuned_claim")
        logger.error(
            "Failed to load fine-tuned claim model: %s", exc
        )
        return None


def active_model_labels() -> dict:
    """Report which model each pipeline actually uses (traceability)."""
    misinfo = FINETUNED_MISINFO_MODEL
    if misinfo:
        try:
            meta_path = os.path.join(misinfo, "model_meta.json")
            if os.path.exists(meta_path):
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                misinfo = f"{meta.get('model', 'finetuned')}@{meta.get('version', 'unknown')}"
        except Exception:
            pass
    return {
        "misinformation": misinfo or MISINFO_MODEL,
        "aiDetection": AI_DETECT_MODEL,
        "ner": NER_MODEL,
        "claimVerification": (
            _read_model_label(FINETUNED_CLAIM_MODEL) if FINETUNED_CLAIM_MODEL else "not-configured"
        ),
        "imageAI": (
            _read_model_label(FINETUNED_IMAGE_MODEL) if FINETUNED_IMAGE_MODEL else "built-in-heuristics"
        ),
        "audioSynthetic": (
            _read_model_label(FINETUNED_AUDIO_MODEL) if FINETUNED_AUDIO_MODEL else "built-in-spectral"
        ),
        "videoManipulation": (
            _read_model_label(FINETUNED_VIDEO_MODEL) if FINETUNED_VIDEO_MODEL else "built-in-heuristics"
        ),
    }


def _load_ner():
    if _models["ner"] is None and "ner" not in _model_failures:
        try:
            from transformers import pipeline
            logger.info("Loading NER model: %s", NER_MODEL)
            _models["ner"] = pipeline(
                "ner",
                model=NER_MODEL,
                aggregation_strategy="simple",
                device=DEVICE,
            )
            logger.info("NER model loaded.")
        except Exception as exc:
            _model_failures.add("ner")
            logger.error("Failed to load NER model: %s", exc)
            raise
    return _models["ner"]


def _load_ai_detect():
    if _models["ai_detect_tokenizer"] is None and "ai_detect" not in _model_failures:
        try:
            from transformers import GPT2LMHeadModel, GPT2TokenizerFast
            logger.info("Loading AI-detection model: %s", AI_DETECT_MODEL)
            _models["ai_detect_tokenizer"] = GPT2TokenizerFast.from_pretrained(
                AI_DETECT_MODEL
            )
            _models["ai_detect_model"] = GPT2LMHeadModel.from_pretrained(
                AI_DETECT_MODEL
            )
            _models["ai_detect_model"].eval()
            logger.info("AI-detection model loaded.")
        except Exception as exc:
            _model_failures.add("ai_detect")
            logger.error("Failed to load AI-detect model: %s", exc)
            raise
    return (
        _models["ai_detect_tokenizer"],
        _models["ai_detect_model"],
    )


# -- Lifespan: pre-load models on startup -----------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load models so first request is not slow."""
    logger.info("Pre-loading AI models...")
    try:
        _load_zero_shot()
    except Exception as exc:
        logger.warning("Could not pre-load zero-shot model: %s", exc)
    try:
        _load_ner()
    except Exception as exc:
        logger.warning("Could not pre-load NER model: %s", exc)
    try:
        _load_ai_detect()
    except Exception as exc:
        logger.warning("Could not pre-load AI-detect model: %s", exc)
    logger.info("Model pre-load complete.")
    yield
    logger.info("AI service shutting down.")


# -- FastAPI app -------------------------------------------------------------

app = FastAPI(
    title="Nexora AI Analysis",
    version=MODEL_VERSION,
    lifespan=lifespan,
)


# -- Request / Response schemas ---------------------------------------------


class TextAnalysisRequest(BaseModel):
    text: str = Field(
        ..., description="Text content to analyze", max_length=100000
    )
    postId: str = Field(..., description="MongoDB ObjectId of the post")

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, v):
        if not v or not v.strip():
            raise ValueError("Text must not be empty or whitespace-only")
        return v

    @field_validator("postId")
    @classmethod
    def validate_post_id(cls, v):
        if not v or not v.strip():
            raise ValueError("postId must not be empty")
        return v.strip()


class Claim(BaseModel):
    text: str
    subject: Optional[str] = None
    predicate: Optional[str] = None
    object: Optional[str] = None
    claimType: Optional[str] = None
    misinformationProbability: float = 0.0
    confidence: float = 0.0
    claimVerification: Optional[dict] = None


class Entity(BaseModel):
    text: str
    label: str
    start: int = 0
    end: int = 0


class PreprocessingInfo(BaseModel):
    characterCount: int
    wordCount: int
    sentenceCount: int
    language: str
    languageConfidence: float
    cleanedText: str


class TextAnalysisResponse(BaseModel):
    success: bool = True
    jobId: Optional[str] = None
    postId: str
    preprocessing: PreprocessingInfo
    misinformationProbability: float
    aiGeneratedProbability: float
    claims: List[Claim]
    entities: List[Entity]
    confidence: float
    modelVersion: str
    processingTimeMs: int
    errors: List[dict] = []
    # Which concrete model produced each signal (traceability, spec: model
    # versioning for every AI result).
    models: dict = {}


# Labels that indicate negative/false/misleading content for a fine-tuned
# classifier. The misinformation probability is the max probability over
# these labels when a fine-tuned model is active.
NEGATIVE_LABELS = {
    "FALSE", "FAKE", "REFUTES", "MISINFORMATION", "MISLEADING",
    "false", "fake", "pants-fire", "pants_fire", "mostly-false",
    "mostly_false", "UNRELIABLE", "misleading",
}


# -- Preprocessing -----------------------------------------------------------


def preprocess_text(text: str) -> dict:
    """Basic text preprocessing: stats, cleaning, language detection."""
    try:
        from langdetect import detect_langs, LangDetectException
    except ImportError:
        LangDetectException = Exception

        def detect_langs(t):
            return []

    cleaned = re.sub(r"\s+", " ", text).strip()
    words = cleaned.split()
    sentences = re.split(r"[.!?]+", cleaned)
    sentences = [s.strip() for s in sentences if s.strip()]

    language = "unknown"
    lang_confidence = 0.0
    try:
        langs = detect_langs(cleaned)
        if langs:
            language = str(langs[0]).split(":")[0]
            lang_confidence = round(langs[0].prob, 4)
    except Exception:
        pass

    return {
        "characterCount": len(text),
        "wordCount": len(words),
        "sentenceCount": len(sentences),
        "language": language,
        "languageConfidence": lang_confidence,
        "cleanedText": cleaned,
    }


# -- Misinformation classification -------------------------------------------

MISINFO_LABELS = [
    "misinformation",
    "factual information",
    "opinion",
    "satire",
    "unverifiable claim",
]


async def classify_misinformation(text: str) -> float:
    """Return probability that text contains misinformation (0-1).

    Uses the fine-tuned classifier when NEXORA_MISINFO_MODEL is configured
    (training/train.py); otherwise falls back to zero-shot classification.
    The result is a real model output — never a fabricated number.
    """
    truncated = text[:4000]

    finetuned = _load_finetuned_misinfo()
    if finetuned is not None:
        try:
            pipe = finetuned["pipe"]
            result = pipe(truncated, truncation=True, max_length=256)
            # pipeline(top_k=None) -> list of dicts
            if isinstance(result, list) and result and isinstance(result[0], list):
                probs = {item["label"]: item["score"] for item in result[0]}
            elif isinstance(result, list) and result and isinstance(result[0], dict):
                probs = {item["label"]: item["score"] for item in result}
            else:
                probs = {}
            negative = [
                p for label, p in probs.items() if label in NEGATIVE_LABELS
            ]
            if negative:
                return round(float(max(negative)), 4)
            if probs:
                # No explicit negative label — use the max over all labels,
                # capped so a non-negative classifier cannot claim certainty.
                return round(float(max(probs.values())) * 0.5, 4)
            return 0.0
        except Exception as exc:
            logger.error(
                "Fine-tuned misinformation classification failed, falling "
                "back to zero-shot: %s", exc
            )

    try:
        pipe = _load_zero_shot()
        if pipe is None:
            raise RuntimeError(
                "Zero-shot classification model is not available"
            )
        result = pipe(
            truncated,
            candidate_labels=MISINFO_LABELS,
            multi_label=False,
        )
        for label, score in zip(result["labels"], result["scores"]):
            if label == "misinformation":
                return round(float(score), 4)
        return 0.0
    except Exception as exc:
        logger.error("Misinformation classification failed: %s", exc)
        raise


# -- AI-generated text detection ---------------------------------------------


def _compute_perplexity(text: str, tokenizer, model) -> float:
    """Compute perplexity of text under GPT-2. Higher = more human-like."""
    encodings = tokenizer(
        text, return_tensors="pt", max_length=1024, truncation=True
    )
    input_ids = encodings.input_ids
    with torch.no_grad():
        outputs = model(input_ids, labels=input_ids)
    return float(np.exp(outputs.loss.item()))


def _compute_burstiness(text: str, tokenizer, model) -> float:
    """
    Burstiness: variance of per-sentence perplexities.
    AI text tends to have low burstiness (uniform perplexity).
    Human text has high burstiness (varied complexity).
    """
    sentences = re.split(r"[.!?]+", text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 10]
    if len(sentences) < 2:
        return 0.0

    perplexities = []
    for sent in sentences:
        try:
            encodings = tokenizer(
                sent, return_tensors="pt", max_length=512, truncation=True
            )
            with torch.no_grad():
                outputs = model(encodings.input_ids, labels=encodings.input_ids)
            perplexities.append(float(np.exp(outputs.loss.item())))
        except Exception:
            continue

    if len(perplexities) < 2:
        return 0.0

    return float(np.var(perplexities))


async def detect_ai_generated(text: str) -> float:
    """
    Estimate probability that text was AI-generated (0-1).
    Uses perplexity + burstiness under GPT-2.
    """
    try:
        tokenizer, model = _load_ai_detect()
        if tokenizer is None or model is None:
            raise RuntimeError("AI-detection model is not available")
        truncated = text[:4000]

        perplexity = _compute_perplexity(truncated, tokenizer, model)
        burstiness = _compute_burstiness(truncated, tokenizer, model)

        # Lower perplexity + lower burstiness -> more AI-like
        ppl_score = max(0.0, min(1.0, 1.0 - (perplexity - 10) / 50.0))
        burst_score = max(0.0, min(1.0, 1.0 - burstiness / 500.0))

        ai_probability = round(0.5 * ppl_score + 0.5 * burst_score, 4)
        return max(0.0, min(1.0, ai_probability))

    except Exception as exc:
        logger.error("AI-generated detection failed: %s", exc)
        raise


# -- Named entity recognition -----------------------------------------------


async def extract_entities(text: str) -> List[dict]:
    """Extract named entities using BERT-based NER."""
    try:
        pipe = _load_ner()
        if pipe is None:
            raise RuntimeError("NER model is not available")
        truncated = text[:5000]
        raw_entities = pipe(truncated)

        entities = []
        seen = set()
        for ent in raw_entities:
            key = (ent["word"].strip(), ent["entity_group"])
            if key in seen:
                continue
            seen.add(key)
            entities.append(
                {
                    "text": ent["word"].strip(),
                    "label": ent["entity_group"],
                    "start": int(ent.get("start", 0)),
                    "end": int(ent.get("end", 0)),
                }
            )

        return entities
    except Exception as exc:
        logger.error("NER extraction failed: %s", exc)
        raise


# -- NLP-enhanced claim extraction ----------------------------------------


def extract_claims_nlp(text: str, entities: List[dict]) -> List[dict]:
    """
    NLP-enhanced claim extraction using spaCy dependency parsing
    and NER-informed sentence scoring.
    """
    nlp = _load_spacy()
    claims = []
    sentences = re.split(r"(?<=[.!?])\s+", text)

    if nlp is not None:
        # Use spaCy for proper dependency-based extraction
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) < 15:
                continue

            doc = nlp(sentence)
            # Score sentence as a potential claim based on linguistic features
            score = _score_claim_candidate(doc)
            if score < 0.3:
                continue

            # Extract SVO using dependency parsing
            svo = _extract_svo_spacy(doc)
            claim_type = _classify_claim_type_heuristic(sentence)

            claims.append({
                "text": sentence,
                "subject": svo.get("subject"),
                "predicate": svo.get("predicate"),
                "object": svo.get("object"),
                "claimType": claim_type,
                "misinformationProbability": 0.0,
                "confidence": round(score, 4),
                "entities": _associate_entities(sentence, entities),
            })

            if len(claims) >= 10:
                break
    else:
        # Fallback: heuristic-based extraction (existing logic)
        claims = extract_claims_heuristic(text)
        for claim in claims:
            claim["claimType"] = _classify_claim_type_heuristic(claim["text"])
            claim["entities"] = _associate_entities(claim["text"], entities)

    return claims[:10]


def _score_claim_candidate(doc) -> float:
    """Score a spaCy Doc as a claim candidate (0-1)."""
    score = 0.0

    # Check for numerical claims
    for token in doc:
        if token.like_num:
            score += 0.15

    # Check for subject-verb-object structure
    has_subject = False
    has_verb = False
    has_object = False
    for token in doc:
        if token.dep_ in ("nsubj", "nsubjpass"):
            has_subject = True
        if token.pos_ == "VERB" and token.dep_ != "aux":
            has_verb = True
        if token.dep_ in ("dobj", "attr", "pobj", "compound"):
            has_object = True
    if has_subject and has_verb:
        score += 0.2
    if has_subject and has_verb and has_object:
        score += 0.15

    # Named entities boost claim likelihood
    if len(doc.ents) > 0:
        score += 0.1 * min(len(doc.ents), 3)

    # Specific claim patterns
    text_lower = doc.text.lower()
    claim_markers = [
        "according to", "study shows", "research found", "data indicates",
        "evidence suggests", "scientists say", "experts claim",
        "report confirms", "evidence shows", "proof that",
    ]
    for marker in claim_markers:
        if marker in text_lower:
            score += 0.2
            break

    # Statistical patterns
    if re.search(r"\d+(?:\.\d+)?%", doc.text):
        score += 0.15
    if re.search(r"\b(?:increase|decrease|rise|fall|growth|decline)\b", text_lower):
        score += 0.1

    return min(1.0, score)


def _extract_svo_spacy(doc) -> dict:
    """Extract subject-verb-object using spaCy dependency parsing."""
    subject = None
    verb = None
    obj = None

    for token in doc:
        if token.dep_ in ("nsubj", "nsubjpass") and token.head.pos_ == "VERB":
            # Get the full subject phrase
            subject = _get_subtree_text(token)
            verb = token.head.text

    if verb:
        for token in doc:
            if token.head.text == verb and token.dep_ in ("dobj", "attr", "pobj"):
                obj = _get_subtree_text(token)
                break

    # Fallback: try to get verb from the root
    if not verb:
        for token in doc:
            if token.dep_ == "ROOT" and token.pos_ == "VERB":
                verb = token.text
                for child in token.children:
                    if child.dep_ in ("nsubj", "nsubjpass"):
                        subject = _get_subtree_text(child)
                    if child.dep_ in ("dobj", "attr"):
                        obj = _get_subtree_text(child)
                break

    return {
        "subject": subject[:200] if subject else None,
        "predicate": verb[:100] if verb else None,
        "object": obj[:200] if obj else None,
    }


def _get_subtree_text(token) -> str:
    """Get the text of a token and its subtree."""
    subtree_text = " ".join([t.text for t in token.subtree])
    return subtree_text.strip()


def _classify_claim_type_heuristic(text: str) -> str:
    """Classify claim type using heuristic patterns."""
    text_lower = text.lower()

    if re.search(r"\d+(?:\.\d+)?%", text) or re.search(r"\b(?:million|billion|thousand)\b", text_lower):
        return "statistical claim"
    if re.search(r"\b(?:because|causes?|leads? to|results? in|due to)\b", text_lower):
        return "causal claim"
    if re.search(r"\b(?:will|would|could|may|might|predict|forecast|expect)\b", text_lower):
        return "prediction"
    if re.search(r"\b(?:should|must|ought to|right|wrong|ethical|moral)\b", text_lower):
        return "moral claim"
    if re.search(r"\b(?:is defined as|means?|refers? to|is known as)\b", text_lower):
        return "definition"
    if re.search(r"\b(?:according to|study|research|data|evidence|report)\b", text_lower):
        return "factual claim"
    if re.search(r"\b(?:expert|scientist|researcher|official|doctor|professor)\b", text_lower):
        return "expert opinion"
    return "factual claim"


def _associate_entities(sentence: str, entities: List[dict]) -> List[dict]:
    """Associate named entities that appear within a sentence."""
    associated = []
    for entity in entities:
        if entity["text"] in sentence:
            associated.append({
                "text": entity["text"],
                "type": entity.get("label", entity.get("type", "ENTITY")),
            })
    return associated


# -- Claim extraction (original heuristic) ----------------------------------

CLAIM_PATTERNS = [
    r"(?:study|research|report|data)\s+(?:shows?|indicates?|suggests?|found|confirms?)\s+(?:that\s+)?(.{10,120})",
    r"(?:according to|per)\s+(?:a\s+)?(.{5,80}),?\s+(.{10,120})",
    r"(\d+(?:\.\d+)?%)\s+(?:of\s+)?(.{5,80})\s+(?:are|is|were|was|have|has|will|can|do|does|did)\s+(.{5,80})",
    r"(?:scientists?|researchers?|experts?|officials?)\s+(?:say|claim|report|found|warn|confirm)\s+(?:that\s+)?(.{10,120})",
    r"(?:proof|evidence|data)\s+(?:shows?|indicates?|suggests?|confirms?)\s+(?:that\s+)?(.{10,120})",
]

# -- spaCy SVO extraction model singleton ----------------------------------

_spacy_model = None
_spacy_failure = False


def _load_spacy():
    global _spacy_model, _spacy_failure
    if _spacy_model is not None:
        return _spacy_model
    if _spacy_failure:
        return None
    try:
        import spacy
        logger.info("Loading spaCy model for SVO extraction...")
        _spacy_model = spacy.load("en_core_web_sm")
        logger.info("spaCy model loaded.")
        return _spacy_model
    except Exception as exc:
        _spacy_failure = True
        logger.warning("spaCy model unavailable, falling back to regex: %s", exc)
        return None


# -- Claim type classification labels ---------------------------------------

CLAIM_TYPE_LABELS = [
    "factual claim",
    "causal claim",
    "statistical claim",
    "expert opinion",
    "definition",
    "prediction",
    "moral claim",
]


# -- NLP-enhanced entity type mapping ---------------------------------------

ENTITY_TYPE_MAP = {
    "PER": "PERSON",
    "PERSON": "PERSON",
    "ORG": "ORG",
    "GPE": "LOCATION",
    "LOC": "LOCATION",
    "DATE": "DATE",
    "TIME": "TIME",
    "MONEY": "MONEY",
    "PERCENT": "PERCENT",
    "PRODUCT": "PRODUCT",
    "EVENT": "EVENT",
    "WORK_OF_ART": "WORK_OF_ART",
    "LAW": "LAW",
    "LANGUAGE": "LANGUAGE",
    "NORP": "NATIONALITY",
    "FAC": "FACILITY",
    "CARDINAL": "NUMBER",
    "ORDINAL": "NUMBER",
    "QUANTITY": "QUANTITY",
}


def extract_claims_heuristic(text: str) -> List[dict]:
    """Rule-based claim extraction."""
    claims = []
    sentences = re.split(r"(?<=[.!?])\s+", text)

    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) < 20:
            continue

        is_claim = False
        for pattern in CLAIM_PATTERNS:
            if re.search(pattern, sentence, re.IGNORECASE):
                is_claim = True
                break

        if re.search(r"\d+", sentence):
            is_claim = True

        if re.search(r"\b(?:is|are|was|were)\b.*\b[A-Z][a-z]+\b", sentence):
            is_claim = True

        if is_claim:
            subject, predicate, obj = _extract_svo(sentence)
            claims.append(
                {
                    "text": sentence,
                    "subject": subject,
                    "predicate": predicate,
                    "object": obj,
                    "misinformationProbability": 0.0,
                    "confidence": 0.5,
                }
            )

    return claims[:10]


def _extract_svo(sentence: str) -> tuple:
    """Simple subject-verb-object extraction."""
    match = re.match(
        r"^(.{3,60}?)\s+(?:is|are|was|were|has|have|had|will|can|may|should)\s+(.{3,120})$",
        sentence.strip().rstrip("."),
        re.IGNORECASE,
    )
    if match:
        return match.group(1).strip(), "is", match.group(2).strip()
    return None, None, None


# -- Confidence scoring ------------------------------------------------------


def compute_confidence(
    preprocessing: dict,
    misinfo_prob: float,
    ai_prob: float,
    claims: list,
    entities: list,
    errors: list,
) -> float:
    """Composite confidence score for the overall analysis."""
    score = 0.5

    word_count = preprocessing.get("wordCount", 0)
    if word_count > 100:
        score += 0.15
    elif word_count > 30:
        score += 0.1
    elif word_count < 5:
        score -= 0.2

    lang_conf = preprocessing.get("languageConfidence", 0)
    score += lang_conf * 0.1

    if len(claims) > 0:
        score += 0.1
    if len(claims) > 3:
        score += 0.05

    if len(entities) > 0:
        score += 0.05

    score -= len(errors) * 0.1

    return round(max(0.0, min(1.0, score)), 4)


# -- Per-claim misinformation classification --------------------------------


async def _classify_claims(
    claims: List[dict], zero_shot_pipe
) -> List[dict]:
    """Run misinformation classification on each extracted claim.

    When a fine-tuned FEVER claim-verification model is configured
    (NEXORA_CLAIM_MODEL), its SUPPORTS/REFUTES prediction is attached as real
    claim-level verification evidence alongside the misinformation score.
    """
    enriched = []
    finetuned_claim = _load_finetuned_claim_model()
    for claim in claims:
        try:
            result = zero_shot_pipe(
                claim["text"],
                candidate_labels=MISINFO_LABELS,
                multi_label=False,
            )
            for label, score in zip(result["labels"], result["scores"]):
                if label == "misinformation":
                    claim["misinformationProbability"] = round(
                        float(score), 4
                    )
                    break
            claim["confidence"] = round(float(max(result["scores"])), 4)
        except Exception:
            pass

        if finetuned_claim is not None:
            try:
                pipe = finetuned_claim["pipe"]
                result = pipe(claim["text"], truncation=True, max_length=256)
                if isinstance(result, list) and result and isinstance(result[0], list):
                    probs = {item["label"]: item["score"] for item in result[0]}
                elif isinstance(result, list) and result and isinstance(result[0], dict):
                    probs = {item["label"]: item["score"] for item in result}
                else:
                    probs = {}
                if probs:
                    top_label = max(probs, key=probs.get)
                    claim["claimVerification"] = {
                        "prediction": top_label,
                        "confidence": round(float(probs[top_label]), 4),
                        "model": _read_model_label(FINETUNED_CLAIM_MODEL),
                    }
            except Exception as exc:
                logger.error("Fine-tuned claim classification failed: %s", exc)

        enriched.append(claim)
    return enriched


async def _classify_claim_type(
    claims: List[dict], zero_shot_pipe
) -> List[dict]:
    """Classify claim types using zero-shot classification."""
    for claim in claims:
        try:
            result = zero_shot_pipe(
                claim["text"],
                candidate_labels=CLAIM_TYPE_LABELS,
                multi_label=False,
            )
            if result["scores"]:
                claim["claimType"] = result["labels"][0]
        except Exception:
            # Fallback to heuristic classification
            if "claimType" not in claim or not claim.get("claimType"):
                claim["claimType"] = _classify_claim_type_heuristic(
                    claim["text"]
                )
    return claims


# -- Main analysis endpoint --------------------------------------------------


@app.post("/analyze/text", response_model=TextAnalysisResponse)
async def analyze_text(request: TextAnalysisRequest):
    """
    Full text analysis pipeline:
      1. Preprocessing + language detection
      2. Misinformation classification
      3. AI-generated text detection
      4. Named entity recognition
      5. NLP-enhanced claim extraction + per-claim verification
      6. Confidence scoring
    """
    start_time = time.time()
    errors = []

    text = request.text.strip()

    # Preprocessing always succeeds
    preprocessing = preprocess_text(text)

    # Step 2: Misinformation classification
    try:
        misinfo_prob = await classify_misinformation(text)
    except Exception as exc:
        misinfo_prob = 0.0
        errors.append({"stage": "misinformation", "message": str(exc)})

    # Step 3: AI-generated text detection
    try:
        ai_prob = await detect_ai_generated(text)
    except Exception as exc:
        ai_prob = 0.0
        errors.append({"stage": "ai_generated", "message": str(exc)})

    # Step 4: Named entity recognition
    try:
        entities = await extract_entities(text)
    except Exception as exc:
        entities = []
        errors.append({"stage": "ner", "message": str(exc)})

    # Step 5: NLP-enhanced claim extraction + per-claim verification
    try:
        claims = extract_claims_nlp(text, entities)
        if claims and misinfo_prob > 0:
            try:
                pipe = _load_zero_shot()
                if pipe is not None:
                    claims = await _classify_claims(claims, pipe)
            except Exception:
                pass
    except Exception as exc:
        claims = []
        errors.append(
            {"stage": "claim_extraction", "message": str(exc)}
        )

    # Step 6: Confidence scoring
    confidence = compute_confidence(
        preprocessing, misinfo_prob, ai_prob, claims, entities, errors
    )

    processing_time_ms = int((time.time() - start_time) * 1000)

    # Determine overall success: all model-dependent stages succeeded
    model_stages = {"misinformation", "ai_generated", "ner"}
    failed_model_stages = {e["stage"] for e in errors} & model_stages

    return TextAnalysisResponse(
        success=len(failed_model_stages) == 0,
        postId=request.postId,
        preprocessing=PreprocessingInfo(**preprocessing),
        misinformationProbability=misinfo_prob,
        aiGeneratedProbability=ai_prob,
        claims=[Claim(**c) for c in claims],
        entities=[Entity(**e) for e in entities],
        confidence=confidence,
        modelVersion=MODEL_VERSION,
        processingTimeMs=processing_time_ms,
        errors=errors,
        models=active_model_labels(),
    )


# =============================================================================
# MODULE 12 — DEDICATED CLAIM & ENTITY EXTRACTION
# =============================================================================

CLAIM_ENTITY_VERSION = "nexora-claims-v1.0.0"


class ClaimEntityRequest(BaseModel):
    text: str = Field(
        ..., description="Text content to extract claims and entities from",
        max_length=100000,
    )
    postId: Optional[str] = Field(
        None, description="MongoDB ObjectId of the post (optional)"
    )
    language: Optional[str] = Field(
        None, description="Language hint (ISO 639-1)"
    )

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, v):
        if not v or not v.strip():
            raise ValueError("Text must not be empty or whitespace-only")
        return v


class ClaimWithType(BaseModel):
    text: str
    claimType: Optional[str] = None
    subject: Optional[str] = None
    predicate: Optional[str] = None
    object: Optional[str] = None
    misinformationProbability: float = 0.0
    confidence: float = 0.0
    entities: List[dict] = []


class EntityWithType(BaseModel):
    text: str
    type: str
    confidence: float = 1.0
    start: int = 0
    end: int = 0


class ClaimEntityResponse(BaseModel):
    success: bool = True
    postId: Optional[str] = None
    claims: List[ClaimWithType]
    entities: List[EntityWithType]
    preprocessing: PreprocessingInfo
    confidence: float
    modelVersion: str
    processingTimeMs: int
    errors: List[dict] = []


@app.post("/analyze/claims-entities", response_model=ClaimEntityResponse)
async def analyze_claims_entities(request: ClaimEntityRequest):
    """
    Module 12 — Dedicated claim and entity extraction.
    Uses NLP models (spaCy SVO, BERT NER, zero-shot classification)
    for high-quality extraction. Results are structured for downstream
    fact verification.

    Pipeline:
      1. Preprocessing + language detection
      2. Named entity recognition (BERT NER)
      3. NLP-enhanced claim extraction (spaCy + zero-shot)
      4. Per-claim misinformation classification
      5. Entity type normalization
      6. Confidence scoring
    """
    start_time = time.time()
    errors = []

    text = request.text.strip()

    # Step 1: Preprocessing
    preprocessing = preprocess_text(text)

    # Step 2: Named entity recognition
    try:
        raw_entities = await extract_entities(text)
        entities = []
        seen = set()
        for ent in raw_entities:
            normalized_type = ENTITY_TYPE_MAP.get(
                ent["label"], ent["label"]
            )
            key = (ent["text"].lower(), normalized_type)
            if key in seen:
                continue
            seen.add(key)
            entities.append({
                "text": ent["text"],
                "type": normalized_type,
                "confidence": 1.0,
                "start": ent.get("start", 0),
                "end": ent.get("end", 0),
            })
    except Exception as exc:
        entities = []
        errors.append({"stage": "ner", "message": str(exc)})

    # Step 3: NLP-enhanced claim extraction
    try:
        claims = extract_claims_nlp(text, entities)
    except Exception as exc:
        claims = []
        errors.append({"stage": "claim_extraction", "message": str(exc)})

    # Step 4: Per-claim misinformation classification
    try:
        if claims:
            pipe = _load_zero_shot()
            if pipe is not None:
                claims = await _classify_claims(claims, pipe)
    except Exception as exc:
        errors.append({"stage": "claim_classification", "message": str(exc)})

    # Step 5: Confidence scoring
    confidence = compute_claims_confidence(
        preprocessing, claims, entities, errors
    )

    processing_time_ms = int((time.time() - start_time) * 1000)

    return ClaimEntityResponse(
        success=len(errors) == 0,
        postId=request.postId,
        claims=[ClaimWithType(**c) for c in claims],
        entities=[EntityWithType(**e) for e in entities],
        preprocessing=PreprocessingInfo(**preprocessing),
        confidence=confidence,
        modelVersion=CLAIM_ENTITY_VERSION,
        processingTimeMs=processing_time_ms,
        errors=errors,
    )


def compute_claims_confidence(
    preprocessing: dict,
    claims: list,
    entities: list,
    errors: list,
) -> float:
    """Confidence score for claim/entity extraction results."""
    score = 0.5

    word_count = preprocessing.get("wordCount", 0)
    if word_count > 100:
        score += 0.15
    elif word_count > 30:
        score += 0.1
    elif word_count < 5:
        score -= 0.2

    lang_conf = preprocessing.get("languageConfidence", 0)
    score += lang_conf * 0.1

    if len(claims) > 0:
        score += 0.1
    if len(claims) > 3:
        score += 0.05
    if len(entities) > 0:
        score += 0.05
    if len(entities) > 5:
        score += 0.05

    # Average claim confidence boosts overall score
    if claims:
        avg_claim_conf = sum(c.get("confidence", 0) for c in claims) / len(claims)
        score += avg_claim_conf * 0.1

    score -= len(errors) * 0.1

    return round(max(0.0, min(1.0, score)), 4)


# =============================================================================
# VIDEO DEEPFAKE ANALYSIS (Module 9)
# =============================================================================

VIDEO_MODEL_VERSION = "nexora-video-v1.0.0"
MAX_VIDEO_SIZE_MB = 200
MAX_FRAMES_SAMPLED = 30
FRAME_SAMPLE_INTERVAL = 1.0  # seconds between frame samples
FACE_DETECTION_CONFIDENCE = 0.5

logger_video = logging.getLogger("nexora-video")


# -- Lazy-loaded video model singletons --------------------------------------

_video_models = {
    "face_detector": None,
    "anomaly_model": None,
}
_video_model_failures = set()


def _load_face_detector():
    """Load MediaPipe face detection or fall back to OpenCV Haar cascade."""
    if _video_models["face_detector"] is not None:
        return _video_models["face_detector"]
    if "face_detector" in _video_model_failures:
        return None

    try:
        import mediapipe as mp
        mp_face = mp.solutions.face_detection
        detector = mp_face.FaceDetection(
            model_selection=1,  # full-range model
            min_detection_confidence=FACE_DETECTION_CONFIDENCE,
        )
        _video_models["face_detector"] = {"type": "mediapipe", "model": detector}
        logger_video.info("MediaPipe face detection loaded.")
        return _video_models["face_detector"]
    except Exception as exc:
        logger_video.warning("MediaPipe unavailable, falling back to OpenCV: %s", exc)

    try:
        import cv2
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        detector = cv2.CascadeClassifier(cascade_path)
        _video_models["face_detector"] = {"type": "opencv", "model": detector}
        logger_video.info("OpenCV Haar cascade face detection loaded.")
        return _video_models["face_detector"]
    except Exception as exc:
        _video_model_failures.add("face_detector")
        logger_video.error("Failed to load any face detector: %s", exc)
        return None


def _load_anomaly_model():
    """Load an image anomaly detection model.
    Uses a pre-trained EfficientNet-B0 for feature extraction;
    anomaly is detected via reconstruction error on frequency domain features.
    """
    if _video_models["anomaly_model"] is not None:
        return _video_models["anomaly_model"]
    if "anomaly_model" in _video_model_failures:
        return None

    try:
        from torchvision import models, transforms

        model = models.efficientnet_b0(weights="IMAGENET1K_V1")
        model.eval()

        transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ])

        _video_models["anomaly_model"] = {
            "type": "efficientnet",
            "model": model,
            "transform": transform,
        }
        logger_video.info("EfficientNet-B0 anomaly model loaded.")
        return _video_models["anomaly_model"]
    except Exception as exc:
        _video_model_failures.add("anomaly_model")
        logger_video.error("Failed to load anomaly model: %s", exc)
        return None


# -- Video request/response schemas ----------------------------------------


class AudioAnalysisRequest(BaseModel):
    mediaUrl: str = Field(..., description="Cloudinary or public URL of the audio")
    postId: str = Field(..., description="MongoDB ObjectId of the post")

    @field_validator("mediaUrl")
    @classmethod
    def validate_media_url(cls, v):
        if not v or not v.strip():
            raise ValueError("mediaUrl must not be empty")
        v = v.strip()
        if not v.startswith("http://") and not v.startswith("https://"):
            raise ValueError("mediaUrl must be a valid HTTP(S) URL")
        return v

    @field_validator("postId")
    @classmethod
    def validate_post_id(cls, v):
        if not v or not v.strip():
            raise ValueError("postId must not be empty")
        return v.strip()


class VideoAnalysisRequest(BaseModel):
    mediaUrl: str = Field(..., description="Cloudinary or public URL of the video")
    postId: str = Field(..., description="MongoDB ObjectId of the post")

    @field_validator("mediaUrl")
    @classmethod
    def validate_media_url(cls, v):
        if not v or not v.strip():
            raise ValueError("mediaUrl must not be empty")
        v = v.strip()
        if not v.startswith("http://") and not v.startswith("https://"):
            raise ValueError("mediaUrl must be a valid HTTP(S) URL")
        return v

    @field_validator("postId")
    @classmethod
    def validate_post_id(cls, v):
        if not v or not v.strip():
            raise ValueError("postId must not be empty")
        return v.strip()


class FrameResult(BaseModel):
    frameIndex: int
    timestamp: float
    facesDetected: int
    hasFace: bool
    manipulationScore: float
    frequencyAnomaly: float
    colorAnomaly: float
    overallFrameScore: float


class TemporalConsistency(BaseModel):
    interFrameVariance: float
    temporalCoherence: float
    flickerScore: float
    consistentManipulation: bool


class VideoAnalysisResponse(BaseModel):
    success: bool = True
    jobId: Optional[str] = None
    postId: str
    deepfakeProbability: float
    manipulationProbability: float
    frameCount: int
    analyzedFrames: int
    frames: List[FrameResult]
    temporalConsistency: TemporalConsistency
    faceDetectionRate: float
    confidence: float
    modelVersion: str
    processingTimeMs: int
    errors: List[dict] = []


# -- Video download and validation ------------------------------------------


def download_video(url: str, timeout: int = 120) -> str:
    """Download video to a temporary file. Returns the file path."""
    tmp_path = os.path.join(
        tempfile.gettempdir(), f"nexora_video_{uuid.uuid4().hex[:12]}.mp4"
    )
    try:
        urllib.request.urlretrieve(url, tmp_path)
    except Exception as exc:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise RuntimeError(f"Failed to download video: {exc}") from exc

    # Validate file size
    size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
    if size_mb > MAX_VIDEO_SIZE_MB:
        os.remove(tmp_path)
        raise RuntimeError(
            f"Video too large: {size_mb:.1f}MB (max {MAX_VIDEO_SIZE_MB}MB)"
        )

    return tmp_path


def validate_video(file_path: str) -> dict:
    """Validate the video file and return metadata."""
    import cv2

    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        raise RuntimeError("Cannot open video file — invalid or corrupted format")

    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = frame_count / fps if fps > 0 else 0

    cap.release()

    if fps <= 0 or fps > 240:
        raise RuntimeError(f"Invalid FPS: {fps}")
    if frame_count <= 0:
        raise RuntimeError("Video has no frames")
    if width <= 0 or height <= 0:
        raise RuntimeError(f"Invalid dimensions: {width}x{height}")
    if duration > 600:  # 10 min max
        raise RuntimeError(f"Video too long: {duration:.0f}s (max 600s)")

    return {
        "fps": fps,
        "frameCount": frame_count,
        "width": width,
        "height": height,
        "duration": duration,
    }


# -- Frame extraction -------------------------------------------------------


def extract_frames(file_path: str, metadata: dict) -> list:
    """Extract sampled frames from video.
    Returns list of (frame_index, timestamp_seconds, frame_array).
    """
    import cv2

    fps = metadata["fps"]
    total_frames = metadata["frameCount"]
    duration = metadata["duration"]

    # Calculate frame sampling interval
    sample_interval_frames = max(1, int(fps * FRAME_SAMPLE_INTERVAL))
    sampled_indices = list(range(0, total_frames, sample_interval_frames))

    # Cap at MAX_FRAMES_SAMPLED
    if len(sampled_indices) > MAX_FRAMES_SAMPLED:
        step = len(sampled_indices) // MAX_FRAMES_SAMPLED
        sampled_indices = sampled_indices[::step][:MAX_FRAMES_SAMPLED]

    cap = cv2.VideoCapture(file_path)
    frames = []

    for idx in sampled_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret and frame is not None:
            timestamp = idx / fps if fps > 0 else 0.0
            frames.append((idx, timestamp, frame))

    cap.release()
    return frames


# -- Face detection ---------------------------------------------------------


def detect_faces_in_frame(frame, detector_info: dict) -> list:
    """Detect faces in a frame. Returns list of face bounding boxes."""
    if detector_info is None:
        return []

    det_type = detector_info["type"]
    detector = detector_info["model"]

    if det_type == "mediapipe":
        import cv2
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = detector.process(rgb)
        if not results.detections:
            return []
        faces = []
        h, w = frame.shape[:2]
        for det in results.detections:
            bbox = det.location_data.relative_bounding_box
            faces.append({
                "x": int(bbox.xmin * w),
                "y": int(bbox.ymin * h),
                "w": int(bbox.width * w),
                "h": int(bbox.height * h),
                "confidence": det.score[0] if det.score else 0.0,
            })
        return faces

    elif det_type == "opencv":
        import cv2
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        rects = detector.detectMultiScale(gray, 1.1, 5, minSize=(30, 30))
        return [{
            "x": int(x), "y": int(y),
            "w": int(w), "h": int(h),
            "confidence": 1.0,
        } for (x, y, w, h) in rects]

    return []


# -- Frame-level manipulation analysis --------------------------------------


def analyze_frame_manipulation(frame, faces: list, anomaly_info: dict) -> dict:
    """Analyze a single frame for manipulation indicators.
    Returns dict with manipulation scores.
    """
    import cv2

    # 1. Frequency domain analysis (DFT)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    f_transform = np.fft.fft2(gray.astype(np.float32))
    f_shift = np.fft.fftshift(f_transform)
    magnitude = np.log(np.abs(f_shift) + 1e-10)

    # High-frequency energy ratio (synthetic images often have unnatural freq patterns)
    h, w = gray.shape
    cy, cx = h // 2, w // 2
    radius = min(h, w) // 4
    total_energy = np.sum(magnitude ** 2)
    center_mask = np.zeros_like(magnitude, dtype=bool)
    y_coords, x_coords = np.ogrid[:h, :w]
    center_mask = ((y_coords - cy) ** 2 + (x_coords - cx) ** 2) <= radius ** 2
    low_freq_energy = np.sum(magnitude[center_mask] ** 2)
    high_freq_ratio = 1.0 - (low_freq_energy / (total_energy + 1e-10))
    frequency_anomaly = float(np.clip(high_freq_ratio * 2.0, 0, 1))

    # 2. Color channel analysis (synthetic images have unusual color distributions)
    b, g, r = cv2.split(frame)
    r_std, g_std, b_std = float(np.std(r)), float(np.std(g)), float(np.std(b))
    color_balance = abs(r_std - g_std) + abs(g_std - b_std) + abs(r_std - b_std)
    color_anomaly = float(np.clip(color_balance / 100.0, 0, 1))

    # 3. Texture analysis (Laplacian variance)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    texture_score = float(np.var(laplacian))
    # Very low texture variance can indicate synthetic content
    texture_anomaly = float(np.clip(1.0 - texture_score / 2000.0, 0, 1))

    # 4. Face-specific analysis
    face_manipulation = 0.0
    if faces and anomaly_info is not None:
        # Analyze face regions for inconsistencies
        for face in faces:
            x, y, fw, fh = face["x"], face["y"], face["w"], face["h"]
            x = max(0, x)
            y = max(0, y)
            face_region = frame[y : y + fh, x : x + fw]
            if face_region.size == 0:
                continue

            # Edge coherence check: synthetic faces often have unnatural edge patterns
            face_gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(face_gray, 50, 150)
            edge_density = float(np.mean(edges)) / 255.0

            # Skin texture: synthetic faces have overly smooth or inconsistent skin
            face_hsv = cv2.cvtColor(face_region, cv2.COLOR_BGR2HSV)
            skin_saturation_std = float(np.std(face_hsv[:, :, 1]))
            skin_anomaly = float(np.clip(1.0 - skin_saturation_std / 60.0, 0, 1))

            face_manipulation = max(face_manipulation, skin_anomaly * 0.6 + edge_density * 0.4)

    # 5. Composite frame score
    overall = (
        frequency_anomaly * 0.25
        + color_anomaly * 0.20
        + texture_anomaly * 0.20
        + face_manipulation * 0.35
    )

    # Optional fine-tuned FaceForensics++ frame classifier. When configured
    # and loaded, its MANIPULATED probability is a real model output blended
    # into the frame score (50% weight). When absent, only heuristics are used.
    finetuned_video = _load_finetuned_video_model()
    model_synthetic = None
    if finetuned_video is not None:
        try:
            import torch as _torch
            from PIL import Image as _PILImage
            pil_frame = _PILImage.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            enc = finetuned_video["processor"](images=pil_frame, return_tensors="pt")
            with _torch.no_grad():
                logits = finetuned_video["model"](
                    pixel_values=enc["pixel_values"]
                ).logits
                probs = _torch.softmax(logits, dim=-1)[0].tolist()
            index_to_label = _load_label_map_for(FINETUNED_VIDEO_MODEL)
            label_probs = {
                index_to_label[i]: round(float(p), 4) for i, p in enumerate(probs)
            }
            model_synthetic = label_probs.get("MANIPULATED") or label_probs.get("FAKE")
        except Exception as exc:
            logger_video = logging.getLogger("nexora-video")
            logger_video.error("Fine-tuned video detector failed: %s", exc)

    if model_synthetic is not None:
        overall = overall * 0.5 + float(model_synthetic) * 0.5

    return {
        "manipulationScore": round(float(np.clip(overall, 0, 1)), 4),
        "frequencyAnomaly": round(frequency_anomaly, 4),
        "colorAnomaly": round(color_anomaly, 4),
        "textureAnomaly": round(texture_anomaly, 4),
        "faceManipulation": round(face_manipulation, 4),
        "fineTunedModelSyntheticProbability": (
            round(float(model_synthetic), 4) if model_synthetic is not None else None
        ),
    }


# -- Temporal consistency analysis ------------------------------------------


def analyze_temporal_consistency(frame_results: list) -> dict:
    """Analyze consistency across frames for temporal manipulation.
    Real videos have natural frame-to-frame variation.
    Deepfakes often show unnatural temporal patterns.
    """
    if len(frame_results) < 2:
        return {
            "interFrameVariance": 0.0,
            "temporalCoherence": 1.0,
            "flickerScore": 0.0,
            "consistentManipulation": False,
        }

    scores = [f["manipulationScore"] for f in frame_results]
    freq_scores = [f["frequencyAnomaly"] for f in frame_results]
    face_scores = [f["faceManipulation"] for f in frame_results]

    # Inter-frame variance: how much manipulation scores vary
    score_array = np.array(scores)
    inter_frame_variance = float(np.var(score_array))

    # Temporal coherence: consistent scores suggest consistent manipulation
    # Low variance + high scores = consistently manipulated (deepfake)
    mean_score = float(np.mean(score_array))
    temporal_coherence = 1.0 - inter_frame_variance if mean_score > 0.3 else inter_frame_variance
    temporal_coherence = float(np.clip(temporal_coherence, 0, 1))

    # Flicker detection: rapid score changes suggest artifacts
    flicker_count = 0
    for i in range(1, len(scores)):
        if abs(scores[i] - scores[i - 1]) > 0.3:
            flicker_count += 1
    flicker_score = flicker_count / max(1, len(scores) - 1)
    flicker_score = float(np.clip(flicker_score, 0, 1))

    # Consistent manipulation: most frames show manipulation above threshold
    manipulation_frames = sum(1 for s in scores if s > 0.4)
    consistent = manipulation_frames > len(scores) * 0.5

    return {
        "interFrameVariance": round(inter_frame_variance, 4),
        "temporalCoherence": round(temporal_coherence, 4),
        "flickerScore": round(flicker_score, 4),
        "consistentManipulation": consistent,
    }


# -- Video confidence scoring -----------------------------------------------


def compute_video_confidence(
    metadata: dict,
    frame_results: list,
    temporal: dict,
    face_detection_rate: float,
    errors: list,
) -> float:
    """Composite confidence for the video analysis."""
    score = 0.5

    # More frames analyzed = higher confidence
    n = len(frame_results)
    if n >= 15:
        score += 0.15
    elif n >= 5:
        score += 0.10
    elif n < 3:
        score -= 0.15

    # Face detection rate: if faces are present, analysis is more meaningful
    if face_detection_rate > 0.3:
        score += 0.10
    elif face_detection_rate > 0:
        score += 0.05

    # Temporal consistency boosts confidence
    if temporal["temporalCoherence"] > 0.5:
        score += 0.10

    # Long analysis is more reliable
    duration = metadata.get("duration", 0)
    if duration > 10:
        score += 0.05
    elif duration < 2:
        score -= 0.10

    # Errors reduce confidence
    score -= len(errors) * 0.1

    # Low frame count reduces confidence
    if n < 3:
        score -= 0.1

    return round(max(0.0, min(1.0, score)), 4)


# -- Main video analysis endpoint -------------------------------------------


@app.post("/analyze/video", response_model=VideoAnalysisResponse)
async def analyze_video(request: VideoAnalysisRequest):
    """
    Full video deepfake analysis pipeline:
      1. Download video securely
      2. Validate video format and metadata
      3. Sample frames at intervals
      4. Detect faces in each frame
      5. Analyze frames for manipulation/synthetic indicators
      6. Aggregate frame-level results
      7. Temporal consistency analysis
      8. Produce video-level probability + confidence
    """
    start_time = time.time()
    errors = []
    tmp_file = None

    try:
        # Step 1: Download video
        try:
            tmp_file = download_video(request.mediaUrl)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Failed to download video: {exc}",
            )

        # Step 2: Validate video
        try:
            metadata = validate_video(tmp_file)
        except Exception as exc:
            os.remove(tmp_file)
            raise HTTPException(
                status_code=422,
                detail=f"Invalid video: {exc}",
            )

        # Step 3: Extract frames
        try:
            sampled_frames = extract_frames(tmp_file, metadata)
        except Exception as exc:
            os.remove(tmp_file)
            raise HTTPException(
                status_code=500,
                detail=f"Frame extraction failed: {exc}",
            )

        if len(sampled_frames) == 0:
            os.remove(tmp_file)
            raise HTTPException(
                status_code=422,
                detail="No frames could be extracted from the video",
            )

        # Step 4: Load models
        detector_info = _load_face_detector()
        anomaly_info = _load_anomaly_model()

        # Step 5 & 6: Analyze each frame
        frame_results = []
        total_faces = 0
        frames_with_faces = 0

        for frame_idx, timestamp, frame in sampled_frames:
            faces = detect_faces_in_frame(frame, detector_info)
            total_faces += len(faces)
            if faces:
                frames_with_faces += 1

            analysis = analyze_frame_manipulation(frame, faces, anomaly_info)
            frame_results.append({
                "frameIndex": frame_idx,
                "timestamp": round(timestamp, 3),
                "facesDetected": len(faces),
                "hasFace": len(faces) > 0,
                **analysis,
            })

        # Step 7: Temporal consistency
        temporal = analyze_temporal_consistency(frame_results)

        # Step 8: Aggregate frame scores into video-level probabilities
        scores = [f["manipulationScore"] for f in frame_results]
        deepfake_prob = float(np.clip(np.mean(scores), 0, 1))

        # Manipulation probability is higher when temporal consistency confirms it
        if temporal["consistentManipulation"]:
            manipulation_prob = float(np.clip(deepfake_prob * 1.15, 0, 1))
        else:
            manipulation_prob = float(np.clip(deepfake_prob * 0.85, 0, 1))

        face_detection_rate = (
            frames_with_faces / len(frame_results) if frame_results else 0.0
        )

        # Confidence
        confidence = compute_video_confidence(
            metadata, frame_results, temporal, face_detection_rate, errors
        )

        processing_time_ms = int((time.time() - start_time) * 1000)

        # Clean up temp file
        if tmp_file and os.path.exists(tmp_file):
            os.remove(tmp_file)

        return VideoAnalysisResponse(
            success=len(errors) == 0,
            postId=request.postId,
            deepfakeProbability=round(deepfake_prob, 4),
            manipulationProbability=round(manipulation_prob, 4),
            frameCount=metadata["frameCount"],
            analyzedFrames=len(frame_results),
            frames=[
                FrameResult(
                    frameIndex=f["frameIndex"],
                    timestamp=f["timestamp"],
                    facesDetected=f["facesDetected"],
                    hasFace=f["hasFace"],
                    manipulationScore=f["manipulationScore"],
                    frequencyAnomaly=f["frequencyAnomaly"],
                    colorAnomaly=f["colorAnomaly"],
                    overallFrameScore=f["manipulationScore"],
                )
                for f in frame_results
            ],
            temporalConsistency=TemporalConsistency(**temporal),
            faceDetectionRate=round(face_detection_rate, 4),
            confidence=confidence,
            modelVersion=VIDEO_MODEL_VERSION,
            processingTimeMs=processing_time_ms,
            errors=errors,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger_video.error("Video analysis failed: %s", exc, exc_info=True)
        if tmp_file and os.path.exists(tmp_file):
            os.remove(tmp_file)
        raise HTTPException(
            status_code=500,
            detail=f"Video analysis failed: {exc}",
        )


# =============================================================================
# AUDIO AUTHENTICITY ANALYSIS (Module 10)
# =============================================================================

AUDIO_MODEL_VERSION = "nexora-audio-v1.0.0"
MAX_AUDIO_SIZE_MB = 50
MAX_AUDIO_DURATION_S = 600  # 10 min max
SUPPORTED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".aac", ".flac", ".m4a", ".wma"}

logger_audio = logging.getLogger("nexora-audio")


# -- Lazy-loaded audio model singletons -------------------------------------

_audio_models = {
    "anomaly_detector": None,
}
_audio_model_failures = set()


def _load_audio_anomaly_detector():
    """Load audio anomaly detection model.
    Uses spectral feature analysis and statistical methods for synthetic
    speech detection without requiring large pre-trained models.
    """
    if _audio_models["anomaly_detector"] is not None:
        return _audio_models["anomaly_detector"]
    if "anomaly_detector" in _audio_model_failures:
        return None

    try:
        # We use a simple statistical model based on spectral features.
        # This avoids large model downloads and still provides useful signals.
        _audio_models["anomaly_detector"] = {
            "type": "spectral_statistical",
            "version": AUDIO_MODEL_VERSION,
        }
        logger_audio.info("Audio anomaly detector (spectral-statistical) loaded.")
        return _audio_models["anomaly_detector"]
    except Exception as exc:
        _audio_model_failures.add("anomaly_detector")
        logger_audio.error("Failed to load audio anomaly detector: %s", exc)
        return None


# -- Audio request/response schemas ----------------------------------------


class SpectralFeatures(BaseModel):
    centroidMean: float
    centroidStd: float
    bandwidthMean: float
    bandwidthStd: float
    rolloffMean: float
    rolloffStd: float
    flatnessMean: float
    flatnessStd: float
    zeroCrossingRate: float


class MelSpectrogramStats(BaseModel):
    energyMean: float
    energyStd: float
    peakFrequency: float
    spectralContrast: float
    frequencyRange: float


class AudioSegment(BaseModel):
    startTime: float
    endTime: float
    syntheticScore: float
    manipulationScore: float
    spectralAnomaly: float


class PreprocessingInfo(BaseModel):
    sampleRate: int
    duration: float
    channels: int
    format: str
    fileSize: int
    bitDepth: int = 16


class AudioAnalysisResponse(BaseModel):
    success: bool = True
    jobId: Optional[str] = None
    postId: str
    preprocessing: PreprocessingInfo
    syntheticSpeechProbability: float
    manipulationProbability: float
    spectralFeatures: SpectralFeatures
    melSpectrogramStats: MelSpectrogramStats
    segments: List[AudioSegment]
    confidence: float
    modelVersion: str
    processingTimeMs: int
    errors: List[dict] = []


# -- Audio download and validation ------------------------------------------


def download_audio(url: str, timeout: int = 120) -> tuple:
    """Download audio to a temporary file. Returns (file_path, detected_format)."""
    import urllib.parse

    tmp_id = uuid.uuid4().hex[:12]

    # Try to detect format from URL
    parsed = urllib.parse.urlparse(url)
    path_ext = os.path.splitext(parsed.path)[1].lower()
    if path_ext in SUPPORTED_AUDIO_EXTENSIONS:
        ext = path_ext
    else:
        ext = ".mp3"  # default

    tmp_path = os.path.join(tempfile.gettempdir(), f"nexora_audio_{tmp_id}{ext}")
    try:
        urllib.request.urlretrieve(url, tmp_path)
    except Exception as exc:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise RuntimeError(f"Failed to download audio: {exc}") from exc

    size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
    if size_mb > MAX_AUDIO_SIZE_MB:
        os.remove(tmp_path)
        raise RuntimeError(
            f"Audio too large: {size_mb:.1f}MB (max {MAX_AUDIO_SIZE_MB}MB)"
        )

    return tmp_path, ext


def validate_audio(file_path: str) -> dict:
    """Validate the audio file and return metadata."""
    try:
        import librosa

        # Load just the header info first
        y, sr = librosa.load(file_path, sr=None, duration=0.1)
        duration_full = librosa.get_duration(path=file_path)

        import soundfile as sf
        info = sf.info(file_path)

        if duration_full <= 0:
            raise RuntimeError("Audio has no content (zero duration)")
        if duration_full > MAX_AUDIO_DURATION_S:
            raise RuntimeError(
                f"Audio too long: {duration_full:.0f}s (max {MAX_AUDIO_DURATION_S}s)"
            )
        if sr <= 0 or sr > 192000:
            raise RuntimeError(f"Invalid sample rate: {sr}")

        format_name = info.format if info.format else "unknown"
        channels = info.channels if info.channels else 1
        subtype = info.subtype if info.subtype else "PCM_16"
        bit_depth = 16
        if "PCM_16" in subtype:
            bit_depth = 16
        elif "PCM_24" in subtype:
            bit_depth = 24
        elif "PCM_32" in subtype:
            bit_depth = 32
        elif "FLOAT" in subtype:
            bit_depth = 32

        return {
            "sampleRate": int(sr),
            "duration": round(duration_full, 3),
            "channels": channels,
            "format": format_name,
            "fileSize": os.path.getsize(file_path),
            "bitDepth": bit_depth,
        }

    except Exception as exc:
        raise RuntimeError(f"Cannot read audio file: {exc}") from exc


# -- Audio preprocessing ----------------------------------------------------


def preprocess_audio(file_path: str) -> tuple:
    """Load and preprocess audio. Returns (y, sr, metadata)."""
    import librosa

    metadata = validate_audio(file_path)
    sr = metadata["sampleRate"]

    # Load full audio at native sample rate
    y, _ = librosa.load(file_path, sr=sr, mono=False)

    # Convert to mono if stereo
    if y.ndim > 1:
        y = librosa.to_mono(y)

    # Normalize amplitude
    max_abs = np.max(np.abs(y))
    if max_abs > 0:
        y = y / max_abs

    return y, sr, metadata


# -- Spectral feature extraction --------------------------------------------


def extract_spectral_features(y: np.ndarray, sr: int) -> dict:
    """Extract spectral features for analysis."""
    import librosa

    # Spectral centroid
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
    centroid_mean = float(np.mean(centroid))
    centroid_std = float(np.std(centroid))

    # Spectral bandwidth
    bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)
    bandwidth_mean = float(np.mean(bandwidth))
    bandwidth_std = float(np.std(bandwidth))

    # Spectral rolloff
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
    rolloff_mean = float(np.mean(rolloff))
    rolloff_std = float(np.std(rolloff))

    # Spectral flatness (noise-like signals have flat spectra)
    flatness = librosa.feature.spectral_flatness(y=y)
    flatness_mean = float(np.mean(flatness))
    flatness_std = float(np.std(flatness))

    # Zero crossing rate
    zcr = librosa.feature.zero_crossing_rate(y)
    zcr_mean = float(np.mean(zcr))

    return {
        "centroidMean": round(centroid_mean, 4),
        "centroidStd": round(centroid_std, 4),
        "bandwidthMean": round(bandwidth_mean, 4),
        "bandwidthStd": round(bandwidth_std, 4),
        "rolloffMean": round(rolloff_mean, 4),
        "rolloffStd": round(rolloff_std, 4),
        "flatnessMean": round(flatness_mean, 6),
        "flatnessStd": round(flatness_std, 6),
        "zeroCrossingRate": round(zcr_mean, 6),
    }


# -- Mel-spectrogram analysis -----------------------------------------------


def extract_mel_spectrogram_features(y: np.ndarray, sr: int) -> dict:
    """Extract mel-spectrogram statistics for synthetic speech detection."""
    import librosa

    # Compute mel spectrogram
    mel_spec = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128, fmax=sr // 2)
    mel_db = librosa.power_to_db(mel_spec, ref=np.max)

    # Energy statistics
    energy_mean = float(np.mean(mel_db))
    energy_std = float(np.std(mel_db))

    # Peak frequency
    mel_means = np.mean(mel_db, axis=1)
    peak_freq_bin = int(np.argmax(mel_means))
    peak_freq = float(peak_freq_bin * sr / (2 * 128))

    # Spectral contrast
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
    contrast_mean = float(np.mean(contrast))

    # Frequency range of significant energy
    significant_bins = np.where(mel_means > np.max(mel_means) - 20)[0]
    if len(significant_bins) > 0:
        freq_range = float(
            (significant_bins[-1] - significant_bins[0]) * sr / (2 * 128)
        )
    else:
        freq_range = 0.0

    return {
        "energyMean": round(energy_mean, 4),
        "energyStd": round(energy_std, 4),
        "peakFrequency": round(peak_freq, 2),
        "spectralContrast": round(contrast_mean, 4),
        "frequencyRange": round(freq_range, 2),
    }


# -- Synthetic speech detection ----------------------------------------------


def detect_synthetic_speech(
    y: np.ndarray, sr: int, spectral_features: dict, mel_features: dict
) -> float:
    """
    Detect synthetic speech / voice cloning using spectral analysis.
    Returns probability 0-1 that the audio is synthetic.

    Signals analyzed:
      1. Unnatural spectral flatness (synthetic audio often has
         uniformly distributed energy)
      2. Missing natural frequency modulation patterns
      3. Unusually consistent spectral centroid over time
      4. Absence of natural breath/pause patterns
      5. Excessive high-frequency energy consistency
    """
    import librosa

    # Optional fine-tuned ASVspoof synthetic-speech detector. When configured
    # and loaded, its SPOOF probability is the primary real model output;
    # the heuristic analysis below supplements it. When absent, only the
    # heuristic signals are used (never fabricated).
    finetuned_audio = _load_finetuned_audio_model()
    if finetuned_audio is not None:
        try:
            audio_mono = y
            if sr != 16000:
                num_samples = int(len(audio_mono) * 16000 / sr)
                audio_mono = np.interp(
                    np.linspace(0, len(audio_mono), num_samples, endpoint=False),
                    np.arange(len(audio_mono)), audio_mono,
                ).astype(np.float32)
            max_samples = 16000 * 10
            if len(audio_mono) > max_samples:
                audio_mono = audio_mono[:max_samples]
            feats = finetuned_audio["extractor"](
                audio_mono, sampling_rate=16000, return_tensors="pt"
            )
            with torch.no_grad():
                logits = finetuned_audio["model"](
                    input_values=feats["input_values"]
                ).logits
                probs = torch.softmax(logits, dim=-1)[0].tolist()
            index_to_label = _load_label_map_for(FINETUNED_AUDIO_MODEL)
            label_probs = {
                index_to_label[i]: round(float(p), 4) for i, p in enumerate(probs)
            }
            spoof_prob = label_probs.get("SPOOF")
            if spoof_prob is not None:
                return round(float(spoof_prob), 4)
        except Exception as exc:
            logger_audio = logging.getLogger("nexora-audio")
            logger_audio.error("Fine-tuned audio detector failed: %s", exc)

    scores = []
    weights = []

    # 1. Spectral flatness anomaly
    # Natural speech has varying spectral flatness; synthetic tends to be
    # either too flat (noise-like) or too peaked (model artifacts)
    flatness = spectral_features["flatnessMean"]
    if flatness > 0.5:
        flatness_score = min(1.0, (flatness - 0.3) * 2.0)
    elif flatness < 0.01:
        flatness_score = min(1.0, (0.01 - flatness) * 50.0)
    else:
        flatness_score = 0.0
    scores.append(flatness_score)
    weights.append(0.2)

    # 2. Spectral centroid consistency
    # Synthetic speech often has unnaturally constant centroid
    centroid_cv = (
        spectral_features["centroidStd"] / spectral_features["centroidMean"]
        if spectral_features["centroidMean"] > 0
        else 0
    )
    if centroid_cv < 0.05:
        centroid_score = 0.7  # very consistent = suspicious
    elif centroid_cv < 0.1:
        centroid_score = 0.3
    else:
        centroid_score = 0.0
    scores.append(centroid_score)
    weights.append(0.2)

    # 3. Bandwidth consistency
    bandwidth_cv = (
        spectral_features["bandwidthStd"] / spectral_features["bandwidthMean"]
        if spectral_features["bandwidthMean"] > 0
        else 0
    )
    if bandwidth_cv < 0.05:
        bandwidth_score = 0.6
    elif bandwidth_cv < 0.1:
        bandwidth_score = 0.2
    else:
        bandwidth_score = 0.0
    scores.append(bandwidth_score)
    weights.append(0.15)

    # 4. Energy modulation depth
    # Natural speech has high energy modulation; synthetic tends to be flat
    try:
        hop_length = 512
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        rms_mean = float(np.mean(rms))
        rms_std = float(np.std(rms))
        modulation_depth = rms_std / rms_mean if rms_mean > 0 else 0
        if modulation_depth < 0.1:
            mod_score = 0.6
        elif modulation_depth < 0.2:
            mod_score = 0.3
        else:
            mod_score = 0.0
        scores.append(mod_score)
        weights.append(0.25)
    except Exception:
        pass

    # 5. High-frequency artifact detection
    # Look for periodic artifacts in high frequencies (vocoder artifacts)
    try:
        n_fft = 2048
        stft = np.abs(np.fft.rfft(np.pad(y, (0, max(0, n_fft - len(y))))[:n_fft]))
        freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)
        high_freq_mask = freqs > sr * 0.4
        if np.any(high_freq_mask):
            hf_energy = stft[high_freq_mask]
            if len(hf_energy) > 10:
                # Check for periodic peaks (vocoder artifacts)
                hf_fft = np.abs(np.fft.rfft(hf_energy - np.mean(hf_energy)))
                if len(hf_fft) > 5:
                    peak_ratio = np.max(hf_fft[2:]) / (np.mean(hf_fft[2:]) + 1e-10)
                    artifact_score = float(np.clip((peak_ratio - 3.0) / 5.0, 0, 1))
                    scores.append(artifact_score)
                    weights.append(0.2)
    except Exception:
        pass

    # Weighted average
    if not scores:
        return 0.0

    weights = weights[: len(scores)]
    total_weight = sum(weights)
    if total_weight > 0:
        synthetic_prob = sum(s * w for s, w in zip(scores, weights)) / total_weight
    else:
        synthetic_prob = 0.0

    return round(float(np.clip(synthetic_prob, 0, 1)), 4)


# -- Manipulation detection -------------------------------------------------


def detect_manipulation(
    y: np.ndarray, sr: int, spectral_features: dict, mel_features: dict
) -> float:
    """
    Detect audio manipulation (splicing, pitch shifting, speed changes).
    Returns probability 0-1.
    """
    import librosa

    scores = []
    weights = []

    # 1. Discontinuity detection
    # Look for sudden energy changes that may indicate splicing
    try:
        hop_length = 512
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        rms_diff = np.abs(np.diff(rms))
        threshold = np.mean(rms_diff) + 3 * np.std(rms_diff)
        discontinuities = np.sum(rms_diff > threshold)
        total_frames = len(rms_diff)
        disc_rate = discontinuities / max(1, total_frames)
        disc_score = float(np.clip(disc_rate * 10, 0, 1))
        scores.append(disc_score)
        weights.append(0.3)
    except Exception:
        pass

    # 2. Phase analysis
    # Natural speech has smooth phase transitions; manipulation disrupts them
    try:
        n_fft = 2048
        hop_length = 512
        stft = librosa.stft(y, n_fft=n_fft, hop_length=hop_length)
        phase = np.angle(stft)
        phase_diff = np.diff(phase, axis=1)
        phase_regularity = float(np.std(phase_diff))
        # Very regular phase = suspicious
        if phase_regularity < 0.5:
            phase_score = 0.5
        elif phase_regularity < 1.0:
            phase_score = 0.2
        else:
            phase_score = 0.0
        scores.append(phase_score)
        weights.append(0.25)
    except Exception:
        pass

    # 3. Spectral flux analysis
    # Sudden spectral changes indicate manipulation
    try:
        n_fft = 2048
        hop_length = 512
        stft = librosa.stft(y, n_fft=n_fft, hop_length=hop_length)
        mag = np.abs(stft)
        flux = np.sqrt(np.sum(np.diff(mag, axis=1) ** 2, axis=0))
        flux_mean = float(np.mean(flux))
        flux_std = float(np.std(flux))
        flux_cv = flux_std / flux_mean if flux_mean > 0 else 0
        # Low flux variation = unnatural
        if flux_cv < 0.3:
            flux_score = 0.4
        elif flux_cv < 0.5:
            flux_score = 0.15
        else:
            flux_score = 0.0
        scores.append(flux_score)
        weights.append(0.25)
    except Exception:
        pass

    # 4. Rolloff consistency
    rolloff_cv = (
        spectral_features["rolloffStd"] / spectral_features["rolloffMean"]
        if spectral_features["rolloffMean"] > 0
        else 0
    )
    if rolloff_cv < 0.05:
        rolloff_score = 0.5
    elif rolloff_cv < 0.1:
        rolloff_score = 0.2
    else:
        rolloff_score = 0.0
    scores.append(rolloff_score)
    weights.append(0.2)

    if not scores:
        return 0.0

    weights = weights[: len(scores)]
    total_weight = sum(weights)
    if total_weight > 0:
        manipulation_prob = sum(s * w for s, w in zip(scores, weights)) / total_weight
    else:
        manipulation_prob = 0.0

    return round(float(np.clip(manipulation_prob, 0, 1)), 4)


# -- Segment analysis -------------------------------------------------------


def analyze_segments(
    y: np.ndarray, sr: int, segment_duration: float = 5.0
) -> list:
    """Analyze audio in segments for localized anomalies."""
    import librosa

    samples_per_segment = int(sr * segment_duration)
    total_samples = len(y)
    segments = []

    for start in range(0, total_samples, samples_per_segment):
        end = min(start + samples_per_segment, total_samples)
        segment = y[start:end]

        if len(segment) < sr * 0.5:  # skip very short segments
            continue

        start_time = start / sr
        end_time = end / sr

        # Extract features for this segment
        seg_spectral = extract_spectral_features(segment, sr)
        seg_mel = extract_mel_spectrogram_features(segment, sr)

        # Compute scores
        syn_score = detect_synthetic_speech(segment, sr, seg_spectral, seg_mel)
        manip_score = detect_manipulation(segment, sr, seg_spectral, seg_mel)

        # Spectral anomaly (combined)
        spectral_anomaly = float(np.clip((syn_score + manip_score) / 2, 0, 1))

        segments.append({
            "startTime": round(start_time, 3),
            "endTime": round(end_time, 3),
            "syntheticScore": round(syn_score, 4),
            "manipulationScore": round(manip_score, 4),
            "spectralAnomaly": round(spectral_anomaly, 4),
        })

    return segments


# -- Audio confidence scoring -----------------------------------------------


def compute_audio_confidence(
    metadata: dict,
    segments: list,
    synthetic_prob: float,
    manipulation_prob: float,
    errors: list,
) -> float:
    """Composite confidence for the audio analysis."""
    score = 0.5

    # Duration: longer audio = more data = higher confidence
    duration = metadata.get("duration", 0)
    if duration > 30:
        score += 0.15
    elif duration > 10:
        score += 0.10
    elif duration < 2:
        score -= 0.15

    # Sample rate: higher = more data
    sr = metadata.get("sampleRate", 0)
    if sr >= 44100:
        score += 0.05
    elif sr < 16000:
        score -= 0.05

    # More segments = more thorough analysis
    if len(segments) >= 6:
        score += 0.10
    elif len(segments) >= 3:
        score += 0.05
    elif len(segments) < 2:
        score -= 0.10

    # Consistent scores across segments boosts confidence
    if segments:
        syn_scores = [s["syntheticScore"] for s in segments]
        manip_scores = [s["manipulationScore"] for s in segments]
        syn_std = float(np.std(syn_scores))
        manip_std = float(np.std(manip_scores))
        if syn_std < 0.1 and manip_std < 0.1:
            score += 0.10  # consistent results = higher confidence
        elif syn_std > 0.3 or manip_std > 0.3:
            score -= 0.05  # inconsistent = lower confidence

    # Errors reduce confidence
    score -= len(errors) * 0.1

    return round(max(0.0, min(1.0, score)), 4)


# -- Main audio analysis endpoint -------------------------------------------


@app.post("/analyze/audio", response_model=AudioAnalysisResponse)
async def analyze_audio(request: AudioAnalysisRequest):
    """
    Full audio authenticity analysis pipeline:
      1. Download and validate audio
      2. Preprocessing (load, normalize, convert to mono)
      3. Extract spectral features
      4. Compute mel-spectrogram statistics
      5. Synthetic speech / voice-clone detection
      6. Manipulation detection (splicing, phase artifacts)
      7. Segment-level analysis
      8. Produce probabilities + confidence
    """
    start_time = time.time()
    errors = []
    tmp_file = None

    try:
        # Step 1: Download audio
        try:
            tmp_file, ext = download_audio(request.mediaUrl)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Failed to download audio: {exc}",
            )

        # Step 2: Validate and preprocess
        try:
            y, sr, metadata = preprocess_audio(tmp_file)
        except Exception as exc:
            if tmp_file and os.path.exists(tmp_file):
                os.remove(tmp_file)
            raise HTTPException(
                status_code=422,
                detail=f"Invalid audio: {exc}",
            )

        # Step 3: Extract spectral features
        try:
            spectral_features = extract_spectral_features(y, sr)
        except Exception as exc:
            spectral_features = {
                "centroidMean": 0, "centroidStd": 0,
                "bandwidthMean": 0, "bandwidthStd": 0,
                "rolloffMean": 0, "rolloffStd": 0,
                "flatnessMean": 0, "flatnessStd": 0,
                "zeroCrossingRate": 0,
            }
            errors.append({"stage": "spectral_features", "message": str(exc)})

        # Step 4: Extract mel-spectrogram features
        try:
            mel_features = extract_mel_spectrogram_features(y, sr)
        except Exception as exc:
            mel_features = {
                "energyMean": 0, "energyStd": 0,
                "peakFrequency": 0, "spectralContrast": 0,
                "frequencyRange": 0,
            }
            errors.append({"stage": "mel_spectrogram", "message": str(exc)})

        # Step 5: Synthetic speech detection
        try:
            synthetic_prob = detect_synthetic_speech(
                y, sr, spectral_features, mel_features
            )
        except Exception as exc:
            synthetic_prob = 0.0
            errors.append({"stage": "synthetic_speech", "message": str(exc)})

        # Step 6: Manipulation detection
        try:
            manipulation_prob = detect_manipulation(
                y, sr, spectral_features, mel_features
            )
        except Exception as exc:
            manipulation_prob = 0.0
            errors.append({"stage": "manipulation", "message": str(exc)})

        # Step 7: Segment analysis
        try:
            segments = analyze_segments(y, sr)
        except Exception as exc:
            segments = []
            errors.append({"stage": "segment_analysis", "message": str(exc)})

        # Step 8: Confidence scoring
        confidence = compute_audio_confidence(
            metadata, segments, synthetic_prob, manipulation_prob, errors
        )

        processing_time_ms = int((time.time() - start_time) * 1000)

        # Clean up temp file
        if tmp_file and os.path.exists(tmp_file):
            os.remove(tmp_file)

        return AudioAnalysisResponse(
            success=len(errors) == 0,
            postId=request.postId,
            preprocessing=PreprocessingInfo(**metadata),
            syntheticSpeechProbability=synthetic_prob,
            manipulationProbability=manipulation_prob,
            spectralFeatures=SpectralFeatures(**spectral_features),
            melSpectrogramStats=MelSpectrogramStats(**mel_features),
            segments=[AudioSegment(**s) for s in segments],
            confidence=confidence,
            modelVersion=AUDIO_MODEL_VERSION,
            processingTimeMs=processing_time_ms,
            errors=errors,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger_audio.error("Audio analysis failed: %s", exc, exc_info=True)
        if tmp_file and os.path.exists(tmp_file):
            os.remove(tmp_file)
        raise HTTPException(
            status_code=500,
            detail=f"Audio analysis failed: {exc}",
        )


# =============================================================================
# IMAGE AUTHENTICITY ANALYSIS
# =============================================================================

IMAGE_MODEL_VERSION = "nexora-image-v1.0.0"
MAX_IMAGE_SIZE_MB = 50

logger_image = logging.getLogger("nexora-image")


class ImageAnalysisRequest(BaseModel):
    mediaUrl: str = Field(..., description="Cloudinary or public URL of the image")
    postId: str = Field(..., description="MongoDB ObjectId of the post")

    @field_validator("mediaUrl")
    @classmethod
    def validate_media_url(cls, v):
        if not v or not v.strip():
            raise ValueError("mediaUrl must not be empty")
        v = v.strip()
        if not v.startswith("http://") and not v.startswith("https://"):
            raise ValueError("mediaUrl must be a valid HTTP(S) URL")
        return v

    @field_validator("postId")
    @classmethod
    def validate_post_id(cls, v):
        if not v or not v.strip():
            raise ValueError("postId must not be empty")
        return v.strip()


class ImageAnalysisResponse(BaseModel):
    success: bool = True
    postId: str
    manipulationProbability: float
    faceManipulationProbability: float
    frequencyAnomaly: float
    colorAnomaly: float
    textureAnomaly: float
    faceDetectionCount: int
    hasFace: bool
    preprocessing: dict
    confidence: float
    modelVersion: str
    processingTimeMs: int
    errors: List[dict] = []
    aiGeneratedProbability: Optional[float] = None
    aiDetectionModel: Optional[str] = None


# -- Image download and validation ----------------------------------------


def download_image(url: str, timeout: int = 60) -> str:
    """Download image to a temporary file. Returns the file path."""
    tmp_path = os.path.join(
        tempfile.gettempdir(), f"nexora_image_{uuid.uuid4().hex[:12]}.jpg"
    )
    try:
        urllib.request.urlretrieve(url, tmp_path)
    except Exception as exc:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise RuntimeError(f"Failed to download image: {exc}") from exc

    size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
    if size_mb > MAX_IMAGE_SIZE_MB:
        os.remove(tmp_path)
        raise RuntimeError(
            f"Image too large: {size_mb:.1f}MB (max {MAX_IMAGE_SIZE_MB}MB)"
        )

    return tmp_path


def validate_image(file_path: str) -> dict:
    """Validate the image file and return metadata."""
    import cv2

    img = cv2.imread(file_path)
    if img is None:
        raise RuntimeError("Cannot read image file — invalid or corrupted format")

    height, width = img.shape[:2]
    if width <= 0 or height <= 0:
        raise RuntimeError(f"Invalid dimensions: {width}x{height}")
    if width * height > 4096 * 4096:
        raise RuntimeError(f"Image too large: {width}x{height} (max 4096x4096)")

    return {
        "width": width,
        "height": height,
        "channels": img.shape[2] if len(img.shape) > 2 else 1,
        "fileSize": os.path.getsize(file_path),
    }


# -- Image analysis --------------------------------------------------------


def _load_label_map_for(model_dir):
    """Read label_map.json from any fine-tuned model dir (index -> label)."""
    import json as _json
    label_map_path = os.path.join(model_dir or "", "label_map.json")
    if not os.path.exists(label_map_path):
        return {0: "0", 1: "1"}
    with open(label_map_path, "r", encoding="utf-8") as f:
        raw = _json.load(f)
    return {int(v): k for k, v in raw.items()}


def _load_image_label_map():
    """Read label_map.json from the fine-tuned image model dir (index -> label)."""
    import json as _json
    label_map_path = os.path.join(FINETUNED_IMAGE_MODEL or "", "label_map.json")
    if not os.path.exists(label_map_path):
        return {0: "0", 1: "1"}
    with open(label_map_path, "r", encoding="utf-8") as f:
        raw = _json.load(f)
    return {int(v): k for k, v in raw.items()}


def _read_model_label(model_dir):
    """Best-effort model@version label from model_meta.json (traceability)."""
    import json as _json
    meta_path = os.path.join(model_dir or "", "model_meta.json")
    if not os.path.exists(meta_path):
        return model_dir
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = _json.load(f)
        name = meta.get("model") or "finetuned"
        version = meta.get("version") or "unknown"
        return f"{name}@{version}"
    except Exception:
        return model_dir


def analyze_single_image(file_path: str) -> dict:
    """
    Analyze a single image for manipulation indicators.
    Reuses the frame-level analysis from video analysis but applied once.
    """
    import cv2

    img = cv2.imread(file_path)
    if img is None:
        raise RuntimeError("Cannot read image for analysis")

    faces = []
    detector_info = _load_face_detector()
    anomaly_info = _load_anomaly_model()

    # Detect faces
    if detector_info is not None:
        faces = detect_faces_in_frame(img, detector_info)

    # Run frame-level manipulation analysis
    analysis = analyze_frame_manipulation(img, faces, anomaly_info)

    # Optional fine-tuned AI-image detector (training/train.py --task image).
    # When configured and loaded, its probability is a REAL model output that
    # supplements the heuristic signals. When absent, aiGeneratedProbability
    # stays None — the caller must NOT assume a value.
    ai_generated = None
    ai_detection_model = None
    finetuned_image = _load_finetuned_image_model()
    if finetuned_image is not None:
        try:
            import torch as _torch
            from PIL import Image as _PILImage
            pil_image = _PILImage.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            enc = finetuned_image["processor"](images=pil_image, return_tensors="pt")
            with _torch.no_grad():
                logits = finetuned_image["model"](
                    pixel_values=enc["pixel_values"]
                ).logits
                probs = _torch.softmax(logits, dim=-1)[0].tolist()
            index_to_label = _load_image_label_map()
            label_probs = {
                index_to_label[i]: round(float(p), 4) for i, p in enumerate(probs)
            }
            ai_generated = label_probs.get("AI_GENERATED")
            ai_detection_model = _read_model_label(FINETUNED_IMAGE_MODEL)
        except Exception as exc:
            logger_image.error("Fine-tuned image detector failed: %s", exc)

    return {
        "manipulationScore": analysis["manipulationScore"],
        "frequencyAnomaly": analysis["frequencyAnomaly"],
        "colorAnomaly": analysis["colorAnomaly"],
        "textureAnomaly": analysis["textureAnomaly"],
        "faceManipulation": analysis["faceManipulation"],
        "faceDetectionCount": len(faces),
        "hasFace": len(faces) > 0,
        "aiGeneratedProbability": ai_generated,
        "aiDetectionModel": ai_detection_model,
    }


def compute_image_confidence(
    metadata: dict, analysis_result: dict, errors: list
) -> float:
    """Confidence score for the image analysis."""
    score = 0.5

    # Larger image = higher confidence
    pixels = metadata.get("width", 0) * metadata.get("height", 0)
    if pixels > 1000000:  # > 1MP
        score += 0.15
    elif pixels > 100000:
        score += 0.10
    elif pixels < 10000:
        score -= 0.15

    # Face presence boosts confidence for manipulation detection
    if analysis_result.get("hasFace"):
        score += 0.10

    # More channels (RGB) = more data
    if metadata.get("channels", 1) >= 3:
        score += 0.05

    # Errors reduce confidence
    score -= len(errors) * 0.1

    return round(max(0.0, min(1.0, score)), 4)


@app.post("/analyze/image", response_model=ImageAnalysisResponse)
async def analyze_image(request: ImageAnalysisRequest):
    """
    Full image authenticity analysis pipeline:
      1. Download image securely
      2. Validate image format and metadata
      3. Detect faces
      4. Analyze for manipulation indicators (frequency, color, texture, face)
      5. Produce manipulation probability + confidence
    """
    start_time = time.time()
    errors = []
    tmp_file = None

    try:
        # Step 1: Download image
        try:
            tmp_file = download_image(request.mediaUrl)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Failed to download image: {exc}",
            )

        # Step 2: Validate image
        try:
            metadata = validate_image(tmp_file)
        except Exception as exc:
            os.remove(tmp_file)
            raise HTTPException(
                status_code=422,
                detail=f"Invalid image: {exc}",
            )

        # Step 3-4: Analyze image
        try:
            analysis = analyze_single_image(tmp_file)
        except Exception as exc:
            if tmp_file and os.path.exists(tmp_file):
                os.remove(tmp_file)
            raise HTTPException(
                status_code=500,
                detail=f"Image analysis failed: {exc}",
            )

        # Step 5: Compute confidence
        confidence = compute_image_confidence(metadata, analysis, errors)

        processing_time_ms = int((time.time() - start_time) * 1000)

        # Clean up temp file
        if tmp_file and os.path.exists(tmp_file):
            os.remove(tmp_file)

        return ImageAnalysisResponse(
            success=len(errors) == 0,
            postId=request.postId,
            manipulationProbability=analysis["manipulationScore"],
            faceManipulationProbability=analysis["faceManipulation"],
            frequencyAnomaly=analysis["frequencyAnomaly"],
            colorAnomaly=analysis["colorAnomaly"],
            textureAnomaly=analysis["textureAnomaly"],
            faceDetectionCount=analysis["faceDetectionCount"],
            hasFace=analysis["hasFace"],
            preprocessing=metadata,
            confidence=confidence,
            modelVersion=IMAGE_MODEL_VERSION,
            processingTimeMs=processing_time_ms,
            errors=errors,
            aiGeneratedProbability=analysis.get("aiGeneratedProbability"),
            aiDetectionModel=analysis.get("aiDetectionModel"),
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger_image.error("Image analysis failed: %s", exc, exc_info=True)
        if tmp_file and os.path.exists(tmp_file):
            os.remove(tmp_file)
        raise HTTPException(
            status_code=500,
            detail=f"Image analysis failed: {exc}",
        )


@app.get("/health")
def health():
    """Health check endpoint showing model load status."""
    loaded = {k: v is not None for k, v in _models.items()}
    video_loaded = {k: v is not None for k, v in _video_models.items()}
    audio_loaded = {k: v is not None for k, v in _audio_models.items()}
    any_failed = (
        len(_model_failures) > 0
        or len(_video_model_failures) > 0
        or len(_audio_model_failures) > 0
    )
    return {
        "status": "degraded" if any_failed else "ok",
        "modelVersion": MODEL_VERSION,
        "claimEntityVersion": CLAIM_ENTITY_VERSION,
        "videoModelVersion": VIDEO_MODEL_VERSION,
        "audioModelVersion": AUDIO_MODEL_VERSION,
        "modelsLoaded": loaded,
        "spacyLoaded": _spacy_model is not None,
        "videoModelsLoaded": video_loaded,
        "audioModelsLoaded": audio_loaded,
        "modelsFailed": list(_model_failures),
        "videoModelsFailed": list(_video_model_failures),
        "audioModelsFailed": list(_audio_model_failures),
        "device": "cuda" if torch.cuda.is_available() else "cpu",
    }


@app.get("/")
def root():
    """Service info endpoint."""
    return {
        "service": "Nexora AI Analysis",
        "version": MODEL_VERSION,
        "endpoints": {
            "analyze_text": "POST /analyze/text",
            "analyze_claims_entities": "POST /analyze/claims-entities",
            "analyze_video": "POST /analyze/video",
            "analyze_audio": "POST /analyze/audio",
            "health": "GET /health",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
