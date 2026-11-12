"""Application entry point for the offline ALPR pipeline."""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

from config import settings
from src.pipeline.alpr_pipeline import ALPRPipeline
from src.utils.logger import configure_logging, get_logger

LOGGER = get_logger(__name__)

VIDEO_EXTENSIONS = {".mp4", ".avi", ".mkv", ".mov", ".webm", ".m4v", ".mpg", ".mpeg"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="alpr",
        description=(
            "Offline license plate recognition pipeline using the trained "
            "vehicle, plate and character detector models."
        ),
    )
    parser.add_argument("source", help="Video file or directory containing videos.")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help=f"Output directory (default: {settings.OUTPUT_DIR}).",
    )
    parser.add_argument(
        "--models-dir",
        type=Path,
        default=None,
        help="Directory containing the three .pt model files.",
    )
    parser.add_argument("--plate-model", type=Path, default=None, help="Plate detector .pt path.")
    parser.add_argument(
        "--vehicle-model",
        type=Path,
        default=None,
        help="Vehicle detector .pt path (use 'none' to disable).",
    )
    parser.add_argument(
        "--char-model",
        type=Path,
        default=None,
        help="A-Z character detector .pt path.",
    )
    parser.add_argument(
        "--ocr",
        choices=("hybrid", "easyocr", "char"),
        default="hybrid",
        help="OCR strategy (default: hybrid).",
    )
    parser.add_argument("--gpu", action="store_true", help="Enable EasyOCR GPU mode.")
    parser.add_argument("--device", default=None, help="Ultralytics device, e.g. cpu, 0.")
    parser.add_argument("--conf", type=float, default=settings.PLATE_CONFIDENCE, help="Plate confidence.")
    parser.add_argument(
        "--vehicle-conf",
        type=float,
        default=settings.VEHICLE_CONFIDENCE,
        help="Vehicle confidence.",
    )
    parser.add_argument(
        "--char-conf",
        type=float,
        default=settings.CHAR_CONFIDENCE,
        help="Character detector confidence.",
    )
    parser.add_argument("--imgsz", type=int, default=settings.IMAGE_SIZE, help="Inference image size.")
    parser.add_argument(
        "--stride",
        type=int,
        default=settings.FRAME_STRIDE,
        help="Run inference every N frames (default: 1).",
    )
    parser.add_argument(
        "--min-votes",
        type=int,
        default=settings.MIN_PLATE_VOTES,
        help="Minimum consistent OCR votes for a track.",
    )
    parser.add_argument("--no-annotated", action="store_true", help="Do not write annotated video.")
    parser.add_argument("--no-db", action="store_true", help="Do not persist results to SQLite.")
    parser.add_argument("--no-crops", action="store_true", help="Do not save plate crop images.")
    parser.add_argument("--display", action="store_true", help="Show processing window (press q to stop).")
    parser.add_argument("--json", action="store_true", help="Print a JSON summary to stdout.")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging.")
    return parser


def resolve_model_paths(args: argparse.Namespace) -> tuple[Path, Path | None, Path]:
    models_dir = args.models_dir or settings.MODELS_DIR
    plate_model = args.plate_model or (models_dir / "plate_detector.pt")
    char_model = args.char_model or (models_dir / "plate_char_detector.pt")

    if args.vehicle_model is not None:
        if str(args.vehicle_model).lower() == "none":
            vehicle_model = None
        else:
            vehicle_model = args.vehicle_model
    else:
        candidate = models_dir / "vehicle_detector.pt"
        vehicle_model = candidate if candidate.exists() else None

    return plate_model, vehicle_model, char_model


def resolve_videos(source: Path) -> list[Path]:
    if source.is_file():
        if source.suffix.lower() not in VIDEO_EXTENSIONS:
            raise ValueError(f"Unsupported video extension: {source.suffix}")
        return [source]
    if source.is_dir():
        videos = sorted(
            path
            for path in source.iterdir()
            if path.is_file() and path.suffix.lower() in VIDEO_EXTENSIONS
        )
        if not videos:
            raise ValueError(f"No video files found in {source}")
        return videos
    raise FileNotFoundError(f"Source not found: {source}")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    configure_logging(logging.DEBUG if args.verbose else logging.INFO)
    settings.ensure_directories()

    try:
        videos = resolve_videos(Path(args.source))
    except (FileNotFoundError, ValueError) as exc:
        LOGGER.error("%s", exc)
        return 2

    plate_model, vehicle_model, char_model = resolve_model_paths(args)
    LOGGER.info("Plate model:   %s", plate_model)
    LOGGER.info("Vehicle model: %s", vehicle_model or "disabled")
    LOGGER.info("Char model:    %s", char_model)
    LOGGER.info("OCR mode:      %s", args.ocr)

    try:
        pipeline = ALPRPipeline(
            plate_model_path=plate_model,
            vehicle_model_path=vehicle_model,
            char_model_path=char_model,
            ocr_mode=args.ocr,
            gpu=args.gpu,
            plate_confidence=args.conf,
            vehicle_confidence=args.vehicle_conf,
            char_confidence=args.char_conf,
            imgsz=args.imgsz,
            device=args.device,
            stride=args.stride,
            min_votes=args.min_votes,
            save_crops=not args.no_crops,
        )
    except Exception as exc:  # noqa: BLE001
        LOGGER.error("Failed to initialise pipeline: %s", exc)
        return 1

    output_root = (args.output or settings.OUTPUT_DIR).resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    summaries: list[dict] = []
    try:
        for video in videos:
            result = pipeline.process_video(
                video_path=video,
                output_dir=output_root / f"{video.stem}_{int(time.time() * 1000)}",
                save_annotated=not args.no_annotated,
                display=args.display,
                save_db=not args.no_db,
            )
            summaries.append(
                {
                    "video": str(video),
                    "job_id": result.job.id,
                    "records": [record.to_dict() for record in result.records],
                    "output_dir": str(result.output_dir),
                    "output_video": str(result.output_video) if result.output_video else None,
                    "results_json": str(result.results_json) if result.results_json else None,
                    "results_csv": str(result.results_csv) if result.results_csv else None,
                }
            )
    except KeyboardInterrupt:
        LOGGER.warning("Interrupted by user.")
        return 130
    except Exception as exc:  # noqa: BLE001
        LOGGER.exception("Processing failed: %s", exc)
        return 1

    if args.json:
        print(json.dumps(summaries, ensure_ascii=False, indent=2))
    else:
        print_summary(summaries)
    return 0


def print_summary(summaries: list[dict]) -> None:
    if not summaries:
        print("No videos processed.")
        return

    for summary in summaries:
        print()
        print(f"Video: {summary['video']}")
        print(f"Job:   {summary['job_id']}")
        print(f"Out:   {summary['output_dir']}")
        records = summary["records"]
        if not records:
            print("Plates: none detected")
            continue
        print(f"Plates: {len(records)}")
        print(f"{'Plate':<16}{'Display':<16}{'Vehicle':<12}{'Conf':>7}{'Quality':>9}{'Time':>8}")
        for record in records:
            print(
                f"{record['plate_number']:<16}"
                f"{record['plate_display']:<16}"
                f"{record['vehicle_type']:<12}"
                f"{record['confidence_score']:>7.3f}"
                f"{record['quality_score']:>9.3f}"
                f"{record['video_time_str']:>8}"
            )
        print()


if __name__ == "__main__":
    sys.exit(main())
