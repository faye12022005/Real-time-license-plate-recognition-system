"""Tests for record consolidation in the ALPR pipeline."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from src.models import VideoJob
from src.pipeline.alpr_pipeline import ALPRPipeline, TrackState


def make_state(
    track_id: int,
    plate: str,
    confidence: float,
    pts_ms: int,
    votes: int = 1,
) -> TrackState:
    state = TrackState(track_id=track_id, first_pts_ms=pts_ms, last_pts_ms=pts_ms)
    state.votes[plate] = votes
    state.vote_scores[plate] = confidence * votes
    state.best_text = plate
    state.best_confidence = confidence
    state.best_quality = confidence
    state.vehicle_votes["car"] = votes
    state.plate_type_votes["white"] = votes
    state.source = "hybrid"
    return state


def make_pipeline() -> ALPRPipeline:
    pipeline = ALPRPipeline.__new__(ALPRPipeline)
    pipeline.min_votes = 2
    pipeline.high_confidence_accept = 0.75
    pipeline.save_crops = False
    return pipeline


def test_build_records_merges_dash_insertion_variants() -> None:
    states = {
        1: make_state(1, "17FF21618", 0.818, 30356),
        2: make_state(2, "41DF21618", 0.728, 30714),
        3: make_state(3, "17F21618", 0.797, 30714),
        4: make_state(4, "77F21618", 0.762, 31429),
        5: make_state(5, "29P60459", 0.851, 32142, votes=3),
        6: make_state(6, "30F438206", 0.673, 30356),
        7: make_state(7, "30N38206", 0.802, 33214),
        8: make_state(8, "99V13428", 0.832, 35000, votes=3),
        9: make_state(9, "13K8206", 0.773, 30356),
    }
    pipeline = make_pipeline()
    job = VideoJob(id="job-test", filename="test.mp4", file_size_bytes=0)

    records = pipeline._build_records(
        states=states,
        job=job,
        video_path=Path("test.mp4"),
        crops_dir=Path("."),
    )
    plates = [record.plate_number for record in records]

    assert "17F21618" in plates
    assert "17FF21618" not in plates
    assert "41DF21618" not in plates
    assert "77F21618" not in plates
    assert "30N38206" in plates
    assert "30F438206" not in plates
    assert "13K8206" not in plates
    assert "29P60459" in plates
    assert "99V13428" in plates

    merged = next(record for record in records if record.plate_number == "17F21618")
    assert merged.votes == 3


def test_build_records_keeps_registration_digit_dropped_by_ocr() -> None:
    states = {
        1: make_state(1, "99V13428", 0.832, 35000, votes=3),
        2: make_state(2, "99V3428", 0.809, 35000),
    }
    pipeline = make_pipeline()
    job = VideoJob(id="job-test", filename="test.mp4", file_size_bytes=0)

    records = pipeline._build_records(
        states=states,
        job=job,
        video_path=Path("test.mp4"),
        crops_dir=Path("."),
    )

    assert [record.plate_number for record in records] == ["99V13428"]


def test_build_records_keeps_distinct_tails_separate() -> None:
    states = {
        1: make_state(1, "30A84469", 0.768, 11071, votes=3),
        2: make_state(2, "30E69937", 0.746, 22856, votes=3),
    }
    pipeline = make_pipeline()
    job = VideoJob(id="job-test", filename="test.mp4", file_size_bytes=0)

    records = pipeline._build_records(
        states=states,
        job=job,
        video_path=Path("test.mp4"),
        crops_dir=Path("."),
    )

    assert {record.plate_number for record in records} == {"30A84469", "30E69937"}


def test_build_records_filters_low_support_candidates() -> None:
    states = {
        1: make_state(1, "51G1163", 0.60, 29286),
    }
    pipeline = make_pipeline()
    job = VideoJob(id="job-test", filename="test.mp4", file_size_bytes=0)

    records = pipeline._build_records(
        states=states,
        job=job,
        video_path=Path("test.mp4"),
        crops_dir=Path("."),
    )

    assert records == []


def test_collect_realtime_records_emits_ready_track_once() -> None:
    pipeline = make_pipeline()
    pipeline.tracker = SimpleNamespace(tracks={1: object()})
    state = make_state(1, "51F88234", 0.90, 1000, votes=2)
    states = {1: state}
    job = VideoJob(id="job-camera", filename="camera_0", file_size_bytes=0)

    records = pipeline._collect_realtime_records(
        states=states,
        job=job,
        video_source="camera_0",
        crops_dir=Path("."),
    )

    assert [record.plate_number for record in records] == ["51F88234"]
    assert state.emitted is True
    assert states[1] is state

    assert pipeline._collect_realtime_records(
        states=states,
        job=job,
        video_source="camera_0",
        crops_dir=Path("."),
    ) == []


def test_collect_realtime_records_drops_expired_unconfirmed_track() -> None:
    pipeline = make_pipeline()
    pipeline.tracker = SimpleNamespace(tracks={})
    states = {1: make_state(1, "51F88234", 0.60, 1000, votes=1)}
    job = VideoJob(id="job-camera", filename="camera_0", file_size_bytes=0)

    records = pipeline._collect_realtime_records(
        states=states,
        job=job,
        video_source="camera_0",
        crops_dir=Path("."),
    )

    assert records == []
    assert states == {}


def test_collect_realtime_records_keeps_active_unconfirmed_track() -> None:
    pipeline = make_pipeline()
    pipeline.tracker = SimpleNamespace(tracks={1: object()})
    state = make_state(1, "51F88234", 0.60, 1000, votes=1)
    states = {1: state}
    job = VideoJob(id="job-camera", filename="camera_0", file_size_bytes=0)

    records = pipeline._collect_realtime_records(
        states=states,
        job=job,
        video_source="camera_0",
        crops_dir=Path("."),
    )

    assert records == []
    assert states[1] is state
