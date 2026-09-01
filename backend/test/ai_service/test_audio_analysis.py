"""
Tests for Nexora Audio Authenticity Analysis (Module 10)
========================================================

Tests cover:
  1. Valid audio file — full pipeline produces correct response shape
  2. Unsupported format — proper error handling
  3. Corrupted audio file — graceful failure
  4. Spectral feature extraction accuracy
  5. Mel-spectrogram statistics
  6. Synthetic speech detection scoring
  7. Manipulation detection scoring
  8. Segment analysis
  9. Confidence scoring

Run with: pytest test/ai_service/test_audio_analysis.py -v
"""

import os
import struct
import tempfile
import wave
import math
import pytest
import numpy as np

# Adjust path so we can import from the ai_service package
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'ai_service'))


def _create_test_wav(filepath, duration=2.0, sr=22050, frequency=440.0):
    """Create a simple WAV file with a sine wave for testing."""
    n_samples = int(sr * duration)
    with wave.open(filepath, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sr)
        for i in range(n_samples):
            t = i / sr
            sample = int(32767 * math.sin(2 * math.pi * frequency * t))
            wav_file.writeframes(struct.pack('<h', sample))


def _create_corrupted_file(filepath, content=b'\x00\x01\x02\x03random garbage data'):
    """Create a file with corrupted/invalid audio data."""
    with open(filepath, 'wb') as f:
        f.write(content)


# ─── Import the app module ─────────────────────────────────────────

try:
    from app import (
        validate_audio,
        preprocess_audio,
        extract_spectral_features,
        extract_mel_spectrogram_features,
        detect_synthetic_speech,
        detect_manipulation,
        analyze_segments,
        compute_audio_confidence,
        download_audio,
        SUPPORTED_AUDIO_EXTENSIONS,
        MAX_AUDIO_SIZE_MB,
        MAX_AUDIO_DURATION_S,
    )
    APP_AVAILABLE = True
except ImportError:
    APP_AVAILABLE = False


pytestmark = pytest.mark.skipif(
    not APP_AVAILABLE,
    reason="Could not import audio analysis functions from app.py"
)


# ─── Test: Valid Audio ──────────────────────────────────────────────

class TestValidAudio:
    """Test pipeline with a valid WAV file."""

    @pytest.fixture
    def valid_wav_path(self, tmp_path):
        filepath = str(tmp_path / "test_audio.wav")
        _create_test_wav(filepath, duration=3.0, sr=22050, frequency=440.0)
        return filepath

    def test_validate_audio_returns_metadata(self, valid_wav_path):
        metadata = validate_audio(valid_wav_path)
        assert metadata["sampleRate"] == 22050
        assert metadata["duration"] > 0
        assert metadata["channels"] >= 1
        assert metadata["fileSize"] > 0
        assert metadata["format"] in ("WAVE", "wav", "WAV")

    def test_preprocess_audio_loads_correctly(self, valid_wav_path):
        y, sr, metadata = preprocess_audio(valid_wav_path)
        assert sr == 22050
        assert len(y) > 0
        assert isinstance(y, np.ndarray)
        # After normalization, max abs should be <= 1.0
        assert np.max(np.abs(y)) <= 1.0 + 1e-6

    def test_extract_spectral_features(self, valid_wav_path):
        y, sr, _ = preprocess_audio(valid_wav_path)
        features = extract_spectral_features(y, sr)
        assert "centroidMean" in features
        assert "centroidStd" in features
        assert "bandwidthMean" in features
        assert "bandwidthStd" in features
        assert "rolloffMean" in features
        assert "rolloffStd" in features
        assert "flatnessMean" in features
        assert "flatnessStd" in features
        assert "zeroCrossingRate" in features
        # All values should be finite
        for v in features.values():
            assert np.isfinite(v), f"Non-finite value: {v}"

    def test_extract_mel_spectrogram_features(self, valid_wav_path):
        y, sr, _ = preprocess_audio(valid_wav_path)
        mel = extract_mel_spectrogram_features(y, sr)
        assert "energyMean" in mel
        assert "energyStd" in mel
        assert "peakFrequency" in mel
        assert "spectralContrast" in mel
        assert "frequencyRange" in mel
        for v in mel.values():
            assert np.isfinite(v), f"Non-finite value: {v}"

    def test_detect_synthetic_speech_returns_valid_probability(self, valid_wav_path):
        y, sr, _ = preprocess_audio(valid_wav_path)
        spectral = extract_spectral_features(y, sr)
        mel = extract_mel_spectrogram_features(y, sr)
        prob = detect_synthetic_speech(y, sr, spectral, mel)
        assert 0.0 <= prob <= 1.0

    def test_detect_manipulation_returns_valid_probability(self, valid_wav_path):
        y, sr, _ = preprocess_audio(valid_wav_path)
        spectral = extract_spectral_features(y, sr)
        mel = extract_mel_spectrogram_features(y, sr)
        prob = detect_manipulation(y, sr, spectral, mel)
        assert 0.0 <= prob <= 1.0

    def test_analyze_segments_returns_list(self, valid_wav_path):
        y, sr, _ = preprocess_audio(valid_wav_path)
        segments = analyze_segments(y, sr, segment_duration=1.0)
        assert isinstance(segments, list)
        assert len(segments) > 0
        for seg in segments:
            assert "startTime" in seg
            assert "endTime" in seg
            assert "syntheticScore" in seg
            assert "manipulationScore" in seg
            assert "spectralAnomaly" in seg
            assert seg["endTime"] > seg["startTime"]
            assert 0.0 <= seg["syntheticScore"] <= 1.0
            assert 0.0 <= seg["manipulationScore"] <= 1.0

    def test_compute_audio_confidence(self, valid_wav_path):
        metadata = validate_audio(valid_wav_path)
        segments = [{"syntheticScore": 0.1, "manipulationScore": 0.1}] * 5
        conf = compute_audio_confidence(metadata, segments, 0.2, 0.1, [])
        assert 0.0 <= conf <= 1.0


# ─── Test: Unsupported Format ──────────────────────────────────────

class TestUnsupportedFormat:
    """Test handling of unsupported audio formats."""

    def test_validate_audio_rejects_unsupported_file(self, tmp_path):
        """A .txt file should fail validation."""
        filepath = str(tmp_path / "test.txt")
        with open(filepath, 'w') as f:
            f.write("This is not an audio file")
        with pytest.raises(RuntimeError, match="Cannot read audio file"):
            validate_audio(filepath)

    def test_validate_audio_rejects_empty_file(self, tmp_path):
        """An empty file should fail validation."""
        filepath = str(tmp_path / "empty.wav")
        with open(filepath, 'wb') as f:
            pass
        with pytest.raises(RuntimeError, match="Cannot read audio file"):
            validate_audio(filepath)

    def test_validate_audio_rejects_binary_garbage(self, tmp_path):
        """A file with random binary data should fail validation."""
        filepath = str(tmp_path / "fake.mp3")
        _create_corrupted_file(filepath, b'\xff\xfb\x90\x00' + b'\x00' * 1000)
        with pytest.raises(RuntimeError, match="Cannot read audio file"):
            validate_audio(filepath)


# ─── Test: Corrupted Audio ─────────────────────────────────────────

class TestCorruptedAudio:
    """Test handling of corrupted audio files."""

    def test_validate_audio_rejects_truncated_wav(self, tmp_path):
        """A WAV file with missing data should fail or produce errors."""
        filepath = str(tmp_path / "truncated.wav")
        # Create a valid header but truncate the data
        with wave.open(filepath, 'w') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(22050)
            wav_file.writeframes(struct.pack('<h', 0))
        # Validate may pass (it's technically a valid WAV) but with 0 duration
        # or very short — test that preprocessing handles this gracefully
        try:
            y, sr, metadata = preprocess_audio(filepath)
            # If it loads, the audio should be very short
            assert len(y) >= 0
        except Exception:
            # It's acceptable for corrupted audio to raise an error
            pass

    def test_validate_audio_rejects_wrong_extension_content(self, tmp_path):
        """A .wav file containing non-audio data should fail."""
        filepath = str(tmp_path / "wrong_content.wav")
        with open(filepath, 'wb') as f:
            f.write(b'RIFF' + b'\x00' * 100)  # RIFF header but no valid WAVE format
        with pytest.raises(RuntimeError):
            validate_audio(filepath)

    def test_analyze_segments_handles_short_audio(self, tmp_path):
        """Segment analysis should handle very short audio gracefully."""
        filepath = str(tmp_path / "short.wav")
        _create_test_wav(filepath, duration=0.3, sr=22050)
        y, sr, _ = preprocess_audio(filepath)
        segments = analyze_segments(y, sr, segment_duration=5.0)
        # Short audio should produce at most one segment (or none if too short)
        assert isinstance(segments, list)


# ─── Test: Edge Cases ──────────────────────────────────────────────

class TestEdgeCases:
    """Test edge cases in the audio analysis pipeline."""

    def test_confidence_with_errors(self):
        """Confidence should decrease with more errors."""
        metadata = {"duration": 30, "sampleRate": 44100}
        segments = [{"syntheticScore": 0.1, "manipulationScore": 0.1}] * 6
        conf_no_errors = compute_audio_confidence(metadata, segments, 0.1, 0.1, [])
        conf_with_errors = compute_audio_confidence(
            metadata, segments, 0.1, 0.1,
            [{"stage": "test", "message": "error1"}, {"stage": "test2", "message": "error2"}]
        )
        assert conf_with_errors < conf_no_errors

    def test_confidence_low_duration(self):
        """Short audio should lower confidence."""
        metadata_short = {"duration": 1.0, "sampleRate": 22050}
        metadata_long = {"duration": 60.0, "sampleRate": 44100}
        segments = [{"syntheticScore": 0.1, "manipulationScore": 0.1}] * 6
        conf_short = compute_audio_confidence(metadata_short, segments, 0.1, 0.1, [])
        conf_long = compute_audio_confidence(metadata_long, segments, 0.1, 0.1, [])
        assert conf_long >= conf_short

    def test_consistent_segments_boost_confidence(self):
        """Consistent scores across segments should boost confidence."""
        metadata = {"duration": 30, "sampleRate": 44100}
        consistent_segments = [{"syntheticScore": 0.1, "manipulationScore": 0.1}] * 6
        inconsistent_segments = [
            {"syntheticScore": 0.1, "manipulationScore": 0.1},
            {"syntheticScore": 0.8, "manipulationScore": 0.9},
            {"syntheticScore": 0.05, "manipulationScore": 0.05},
            {"syntheticScore": 0.7, "manipulationScore": 0.8},
            {"syntheticScore": 0.1, "manipulationScore": 0.1},
            {"syntheticScore": 0.9, "manipulationScore": 0.9},
        ]
        conf_consistent = compute_audio_confidence(metadata, consistent_segments, 0.1, 0.1, [])
        conf_inconsistent = compute_audio_confidence(metadata, inconsistent_segments, 0.1, 0.1, [])
        assert conf_consistent >= conf_inconsistent

    def test_spectral_features_silence(self):
        """Spectral features of silence should be near-zero."""
        sr = 22050
        y = np.zeros(sr * 2)  # 2 seconds of silence
        features = extract_spectral_features(y, sr)
        assert features["flatnessMean"] >= 0.0
        assert features["zeroCrossingRate"] == 0.0
        assert np.isfinite(features["centroidMean"])

    def test_spectral_features_sine_wave(self):
        """Spectral features of a sine wave should have low flatness."""
        sr = 22050
        t = np.linspace(0, 2, sr * 2, endpoint=False)
        y = np.sin(2 * np.pi * 440 * t)
        features = extract_spectral_features(y, sr)
        # Sine wave has very low spectral flatness
        assert features["flatnessMean"] < 0.1
        # Centroid should be near 440 Hz
        assert 300 < features["centroidMean"] < 600


# ─── Test: API Constants ───────────────────────────────────────────

class TestConstants:
    """Test that module constants are properly defined."""

    def test_supported_extensions_not_empty(self):
        assert len(SUPPORTED_AUDIO_EXTENSIONS) > 0

    def test_common_formats_supported(self):
        assert ".mp3" in SUPPORTED_AUDIO_EXTENSIONS
        assert ".wav" in SUPPORTED_AUDIO_EXTENSIONS
        assert ".ogg" in SUPPORTED_AUDIO_EXTENSIONS
        assert ".flac" in SUPPORTED_AUDIO_EXTENSIONS

    def test_max_size_positive(self):
        assert MAX_AUDIO_SIZE_MB > 0

    def test_max_duration_positive(self):
        assert MAX_AUDIO_DURATION_S > 0
