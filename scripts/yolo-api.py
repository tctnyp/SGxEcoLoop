import base64
import binascii
import io
import os
import re
import secrets
import time
from typing import Annotated

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO


MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "yolo26n.pt")
DEVICE = os.getenv("YOLO_DEVICE", "cpu")
MAX_IMAGE_BYTES = int(os.getenv("YOLO_MAX_IMAGE_BYTES", str(8 * 1024 * 1024)))
MIN_CONFIDENCE = float(os.getenv("YOLO_MIN_CONFIDENCE", "0.8"))
SERVICE_TOKEN = os.getenv("YOLO_SERVICE_TOKEN", "")

app = FastAPI(title="Novo YOLO Detection API", version="1.0.0")
model = YOLO(MODEL_PATH)


class AnalyzeRequest(BaseModel):
    image: str = Field(min_length=32)
    description: str = Field(min_length=3, max_length=2_000)


# YOLO's general COCO model cannot prove most sustainability actions. Only
# automatically approve tasks where the description names an object/action the
# model can directly see. Everything else is deliberately sent to staff review.
TASK_LABEL_RULES: tuple[tuple[re.Pattern[str], set[str]], ...] = (
    (re.compile(r"\b(bottle|refill|drink container|return right)\b", re.I), {"bottle", "cup"}),
    (re.compile(r"\b(cup|mug)\b", re.I), {"cup"}),
    (re.compile(r"\b(recycl|sorting|sorted|cans?|containers?)\b", re.I), {"bottle", "cup"}),
    (re.compile(r"\b(reusable bag|shopping bag|tote|backpack)\b", re.I), {"handbag", "backpack"}),
    (re.compile(r"\b(public transport|bus|train)\b", re.I), {"bus", "train"}),
)


def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    if not SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="Service authentication is not configured")
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(token, SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid bearer token")


def decode_data_url(value: str) -> Image.Image:
    match = re.fullmatch(r"data:image/(jpeg|jpg|png|webp);base64,(.+)", value, re.I | re.S)
    if not match:
        raise HTTPException(status_code=400, detail="Expected a JPEG, PNG, or WebP data URL")
    try:
        raw = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Invalid base64 image")
    return open_image(raw)


def open_image(raw: bytes) -> Image.Image:
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image is empty or too large")
    try:
        image = Image.open(io.BytesIO(raw))
        image.verify()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid image")
    if image.width * image.height > 25_000_000:
        raise HTTPException(status_code=413, detail="Image dimensions are too large")
    return image


def predict(image: Image.Image) -> tuple[list[dict], float]:
    started = time.perf_counter()
    results = model.predict(source=image, device=DEVICE, verbose=False)
    detections: list[dict] = []
    for result in results:
        for box in result.boxes:
            class_id = int(box.cls[0])
            x1, y1, x2, y2 = map(float, box.xyxy[0])
            detections.append({
                "class_id": class_id,
                "class": result.names[class_id],
                "confidence": round(float(box.conf[0]), 4),
                "box": {"x1": round(x1, 2), "y1": round(y1, 2), "x2": round(x2, 2), "y2": round(y2, 2)},
            })
    return detections, round((time.perf_counter() - started) * 1000, 2)


def relevant_labels(description: str) -> set[str]:
    labels: set[str] = set()
    for pattern, matches in TASK_LABEL_RULES:
        if pattern.search(description):
            labels.update(matches)
    return labels


def summarize_detections(detections: list[dict]) -> str:
    counts: dict[str, int] = {}
    for detection in detections:
        label = detection["class"]
        counts[label] = counts.get(label, 0) + 1
    if not counts:
        return "YOLO did not detect any objects in this image."
    parts = [f"{count} {label}{'' if count == 1 else 's'}" for label, count in counts.items()]
    return "YOLO detected " + ", ".join(parts) + "."


@app.get("/")
def root():
    return {"status": "online", "model": MODEL_PATH, "device": DEVICE}


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_PATH, "device": DEVICE}


@app.post("/analyze", dependencies=[Depends(require_token)])
def analyze(payload: AnalyzeRequest):
    image = decode_data_url(payload.image)
    detections, processing_ms = predict(image)
    expected = relevant_labels(payload.description)
    relevant = [item for item in detections if item["class"] in expected]
    best = max(relevant, key=lambda item: item["confidence"], default=None)
    confidence = best["confidence"] if best else None
    accepted = confidence is not None and confidence >= MIN_CONFIDENCE
    detected_summary = summarize_detections(detections)
    if accepted:
        decision_reason = f"Matched {best['class']} at {confidence * 100:.1f}%, above the {MIN_CONFIDENCE * 100:.0f}% automatic threshold."
    elif best:
        decision_reason = f"Matched {best['class']} at {confidence * 100:.1f}%, below the {MIN_CONFIDENCE * 100:.0f}% automatic threshold."
    elif expected:
        decision_reason = "No detected object matched the task description, so staff review is required."
    else:
        decision_reason = "This task description cannot be verified safely by the general YOLO object model."
    return {
        "confidence": confidence,
        "label": best["class"] if best else None,
        "accepted": accepted,
        "model": os.path.basename(MODEL_PATH),
        "detections": [
            {"label": item["class"], "confidence": item["confidence"], "box": item["box"]}
            for item in sorted(detections, key=lambda item: item["confidence"], reverse=True)[:20]
        ],
        "expected_labels": sorted(expected),
        "summary": detected_summary,
        "decision_reason": decision_reason,
        "processing_ms": processing_ms,
    }


@app.post("/detect", dependencies=[Depends(require_token)])
async def detect(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload an image file")
    raw = await file.read(MAX_IMAGE_BYTES + 1)
    image = open_image(raw)
    detections, processing_ms = predict(image)
    return {
        "filename": file.filename,
        "width": image.width,
        "height": image.height,
        "detections": detections,
        "count": len(detections),
        "processing_ms": processing_ms,
    }
