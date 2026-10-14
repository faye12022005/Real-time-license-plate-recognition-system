"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Play,
  Pause,
  UploadCloud,
  FileVideo,
  Cpu,
  Scan,
  Compass,
  CheckCircle2,
  Clock,
  Sparkles,
  Maximize2,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { PlateBadge, VehicleBadge } from "@/components/shared/Badge";
import { PlateRecord, VehicleType } from "@/types";
import { MOCK_PLATES } from "@/lib/mockData";

// Dữ liệu mô phỏng vị trí Bounding Box các xe theo từng mốc thời gian (giây)
interface SimulatedTrack {
  id: string;
  startSec: number;
  endSec: number;
  plate_number: string;
  plate_display: string;
  province: string;
  vehicle_type: VehicleType;
  confidence: number;
  speed: number;
  crop_image_url: string;
  // Bounding box chuẩn hóa [x, y, w, h] trong [0..1]
  baseBox: [number, number, number, number];
}

const TIMELINE_TRACKS: SimulatedTrack[] = [
  {
    id: "trk-1",
    startSec: 1,
    endSec: 9,
    plate_number: "51F88234",
    plate_display: "51F-882.34",
    province: "TP. Hồ Chí Minh",
    vehicle_type: "car",
    confidence: 0.98,
    speed: 42.5,
    crop_image_url: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=360&q=80",
    baseBox: [0.22, 0.45, 0.28, 0.32],
  },
  {
    id: "trk-2",
    startSec: 4,
    endSec: 14,
    plate_number: "59P299811",
    plate_display: "59P2-998.11",
    province: "TP. Hồ Chí Minh",
    vehicle_type: "motorcycle",
    confidence: 0.95,
    speed: 38.0,
    crop_image_url: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=360&q=80",
    baseBox: [0.62, 0.52, 0.16, 0.28],
  },
  {
    id: "trk-3",
    startSec: 8,
    endSec: 18,
    plate_number: "29A12345",
    plate_display: "29A-123.45",
    province: "TP. Hà Nội",
    vehicle_type: "car",
    confidence: 0.99,
    speed: 48.0,
    crop_image_url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=360&q=80",
    baseBox: [0.12, 0.38, 0.26, 0.30],
  },
  {
    id: "trk-4",
    startSec: 14,
    endSec: 25,
    plate_number: "43C67890",
    plate_display: "43C-678.90",
    province: "TP. Đà Nẵng",
    vehicle_type: "truck",
    confidence: 0.94,
    speed: 52.0,
    crop_image_url: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=360&q=80",
    baseBox: [0.38, 0.32, 0.32, 0.42],
  },
  {
    id: "trk-5",
    startSec: 20,
    endSec: 32,
    plate_number: "30H88888",
    plate_display: "30H-888.88",
    province: "TP. Hà Nội",
    vehicle_type: "car",
    confidence: 0.99,
    speed: 60.5,
    crop_image_url: "https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=360&q=80",
    baseBox: [0.55, 0.42, 0.28, 0.34],
  },
  {
    id: "trk-6",
    startSec: 26,
    endSec: 40,
    plate_number: "51B55512",
    plate_display: "51B-555.12",
    province: "TP. Hồ Chí Minh",
    vehicle_type: "bus",
    confidence: 0.96,
    speed: 45.0,
    crop_image_url: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=360&q=80",
    baseBox: [0.18, 0.28, 0.35, 0.45],
  },
];

const DEFAULT_DEMO_VIDEO =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

export function RealtimeVideoScanner() {
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [videoFileName, setVideoFileName] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(45);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [detectedPlates, setDetectedPlates] = useState<PlateRecord[]>([]);
  const [lastScannedPlate, setLastScannedPlate] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const detectedPlateNumbersRef = useRef<Set<string>>(new Set());

  // Thu hồi Object URL khi unmount để chống rò rỉ bộ nhớ RAM
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  // Xử lý upload file video từ máy người dùng
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      const objectUrl = URL.createObjectURL(file);
      objectUrlRef.current = objectUrl;

      setVideoSrc(objectUrl);
      setVideoFileName(file.name);
      setDetectedPlates([]);
      detectedPlateNumbersRef.current.clear();
      setCurrentTime(0);
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
    }
  };

  // Nạp lại video demo mẫu
  const handleLoadDemo = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setVideoSrc(DEFAULT_DEMO_VIDEO);
    setVideoFileName("nga_tu_hang_xanh_peak_traffic.mp4");
    setDetectedPlates([]);
    detectedPlateNumbersRef.current.clear();
    setCurrentTime(0);
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
    renderOverlay();
  };

  const jumpToTime = (targetSeconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = targetSeconds;
    setCurrentTime(targetSeconds);
    renderOverlay();
    if (!isPlaying) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs) || secs < 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Vẽ Canvas Bounding Box thời gian thực khi video phát (không gọi setState liên tục)
  const renderOverlay = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const time = video.currentTime;

    // Tìm các xe đang hiện diện tại giây 'time'
    const visibleTracks = TIMELINE_TRACKS.filter(
      (trk) => time >= trk.startSec && time <= trk.endSec
    );

    // Cập nhật danh sách biển số mới phát hiện (chỉ kích hoạt setState khi có biển mới)
    const newlyDetected = TIMELINE_TRACKS.filter(
      (trk) => time >= trk.startSec && !detectedPlateNumbersRef.current.has(trk.plate_number)
    );

    if (newlyDetected.length > 0) {
      newlyDetected.forEach((trk) => detectedPlateNumbersRef.current.add(trk.plate_number));
      const latest = newlyDetected[newlyDetected.length - 1];
      setLastScannedPlate(latest.plate_display);

      const newRecords: PlateRecord[] = newlyDetected.map((trk) => ({
        id: `live-${trk.id}-${Date.now()}`,
        job_id: "current-video-job",
        job_filename: videoFileName,
        track_id: parseInt(trk.id.replace("trk-", "")) * 100,
        plate_number: trk.plate_number,
        plate_display: trk.plate_display,
        province: trk.province,
        plate_type: trk.vehicle_type === "truck" || trk.vehicle_type === "bus" ? "yellow" : "white",
        vehicle_type: trk.vehicle_type,
        confidence_score: trk.confidence,
        quality_score: 0.94,
        crop_image_url: trk.crop_image_url,
        pts_ms: Math.floor(trk.startSec * 1000),
        video_time_str: formatTime(trk.startSec),
        timestamp: new Date().toISOString(),
        speed_kmh: trk.speed,
      }));

      setDetectedPlates((prev) => [...newRecords, ...prev]);
    }

    // Vẽ từng Bounding Box & HUD lên Canvas
    visibleTracks.forEach((trk) => {
      // Tính chuyển động tịnh tiến theo thời gian
      const progress = (time - trk.startSec) / (trk.endSec - trk.startSec);
      const [bx, by, bw, bh] = trk.baseBox;
      const x = (bx + progress * 0.08) * width;
      const y = (by + progress * 0.04) * height;
      const w = bw * width;
      const h = bh * height;

      // Màu sắc theo loại xe
      let boxColor = "#06b6d4"; // Cyan for car
      if (trk.vehicle_type === "motorcycle") boxColor = "#10b981"; // Emerald
      if (trk.vehicle_type === "bus") boxColor = "#f59e0b"; // Amber
      if (trk.vehicle_type === "truck") boxColor = "#ec4899"; // Pink

      // 1. Vẽ khung viền Bounding Box công nghệ
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 2.5;
      ctx.fillStyle = "rgba(15, 23, 42, 0.12)";
      ctx.strokeRect(x, y, w, h);
      ctx.fillRect(x, y, w, h);

      // 2. Vẽ 4 góc định vị (Tech brackets)
      const bracketLen = 14;
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 3;

      // Góc trên trái
      ctx.beginPath();
      ctx.moveTo(x, y + bracketLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + bracketLen, y);
      ctx.stroke();

      // Góc trên phải
      ctx.beginPath();
      ctx.moveTo(x + w - bracketLen, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + bracketLen);
      ctx.stroke();

      // Góc dưới trái
      ctx.beginPath();
      ctx.moveTo(x, y + h - bracketLen);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + bracketLen, y + h);
      ctx.stroke();

      // Góc dưới phải
      ctx.beginPath();
      ctx.moveTo(x + w - bracketLen, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w, y + h - bracketLen);
      ctx.stroke();

      // 3. Nhãn công nghệ phía trên BBox
      const label = `${trk.vehicle_type.toUpperCase()} #${trk.id} | ${trk.plate_display} (${(
        trk.confidence * 100
      ).toFixed(0)}%)`;
      ctx.font = "bold 11px Inter, sans-serif";
      const textWidth = ctx.measureText(label).width;

      ctx.fillStyle = boxColor;
      ctx.fillRect(x, Math.max(0, y - 22), textWidth + 12, 22);

      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(label, x + 6, Math.max(14, y - 7));

      // 4. Khung quét biển số xe nổi bật
      const plateW = w * 0.45;
      const plateH = h * 0.22;
      const plateX = x + (w - plateW) / 2;
      const plateY = y + h - plateH - 8;

      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.strokeStyle = "#0F172A";
      ctx.lineWidth = 1.5;
      ctx.fillRect(plateX, plateY, plateW, plateH);
      ctx.strokeRect(plateX, plateY, plateW, plateH);

      ctx.font = "900 10px Roboto Mono, monospace";
      ctx.fillStyle = "#0F172A";
      ctx.textAlign = "center";
      ctx.fillText(trk.plate_display, plateX + plateW / 2, plateY + plateH / 2 + 3.5);
      ctx.textAlign = "start"; // Reset
    });
  }, [videoFileName]);

  // Vòng lặp render canvas: chỉ chạy liên tục 60 FPS khi video đang PLAYING
  useEffect(() => {
    let animId: number;
    if (isPlaying) {
      const loop = () => {
        renderOverlay();
        animId = requestAnimationFrame(loop);
      };
      animId = requestAnimationFrame(loop);
    } else {
      // Khi tạm dừng hoặc nạp video mới: vẽ 1 lần duy nhất để giữ bounding box tại frame hiện tại
      renderOverlay();
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, renderOverlay]);

  // Cập nhật kích thước canvas theo video
  useEffect(() => {
    const handleResize = () => {
      if (videoRef.current && canvasRef.current) {
        canvasRef.current.width = videoRef.current.clientWidth;
        canvasRef.current.height = videoRef.current.clientHeight;
        renderOverlay();
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [renderOverlay]);

  return (
    <div className="bg-surface border border-border rounded-bento p-5 lg:p-6 shadow-bento space-y-5">
      {/* 1. Header Toolbar Bento */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary-light text-primary border border-primary-border">
            <Scan className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="font-heading font-black text-base text-content-primary tracking-tight flex items-center gap-2">
              Bộ Xử lý Nhận diện Biển số Thời gian thực
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-status-success border border-emerald-200">
                REAL-TIME AI SCANNER
              </span>
            </h2>
            <p className="text-xs text-content-muted">
              Phát hiện xe và bóc tách biển số tự động qua từng khung hình • Tự động lưu Database
            </p>
          </div>
        </div>

        {/* Nút Tải Video & Chạy Demo Mẫu */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-xs transition-all hover:scale-[1.02]"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Tải Video từ máy</span>
          </button>
          <button
            onClick={handleLoadDemo}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-muted hover:bg-slate-200 text-content-secondary hover:text-content-primary text-xs font-semibold rounded-xl border border-border transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Video mẫu Demo</span>
          </button>
        </div>
      </div>

      {/* 2. Main Grid: Video Player + Realtime Plate Feed Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Video Player with Real-time Canvas BBox HUD (8 Cột) */}
        <div className="lg:col-span-8 flex flex-col justify-between space-y-3">
          {/* Khung hiển thị Video + Canvas HUD hoặc Khung Trống */}
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-md flex items-center justify-center select-none group">
            {videoSrc ? (
              <>
                {/* HTML5 Video Element */}
                <video
                  ref={videoRef}
                  src={videoSrc}
                  muted={isMuted}
                  playsInline
                  crossOrigin="anonymous"
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      setCurrentTime(videoRef.current.currentTime);
                    }
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      const d = videoRef.current.duration;
                      setDuration(Number.isFinite(d) && d > 0 ? d : 45);
                      if (canvasRef.current) {
                        canvasRef.current.width = videoRef.current.clientWidth || 800;
                        canvasRef.current.height = videoRef.current.clientHeight || 450;
                      }
                      renderOverlay();
                    }
                  }}
                  onEnded={() => setIsPlaying(false)}
                  className="w-full h-full object-contain pointer-events-auto cursor-pointer"
                  onClick={togglePlay}
                />

                {/* Canvas Overlay vẽ Bounding Box */}
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />

                {/* HUD Status Header Overlay */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                  <div className="flex items-center gap-2 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-white">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-[11px] font-mono font-bold tracking-tight text-emerald-400">
                      AI SCANNING ACTIVE
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono border-l border-slate-700 pl-2">
                      YOLOv11 + RapidOCR
                    </span>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-white font-mono text-[10px]">
                    <span className="text-blue-400 font-bold">28.5 FPS</span>
                    <span className="text-slate-400">• ZERO-DROP</span>
                  </div>
                </div>

                {/* Flash Scanner Notification khi vừa nhận diện biển số mới */}
                {lastScannedPlate && (
                  <div className="absolute bottom-4 left-4 bg-primary/90 backdrop-blur-md text-white px-3.5 py-1.5 rounded-xl border border-blue-400 text-xs font-mono font-bold flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-none">
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>QUÉT THÀNH CÔNG: {lastScannedPlate}</span>
                  </div>
                )}
              </>
            ) : (
              /* Giao diện khung hình Trống (Empty Video Viewport) */
              <div className="p-8 text-center flex flex-col items-center justify-center space-y-3 max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-700 text-primary flex items-center justify-center shadow-inner">
                  <Scan className="w-8 h-8 text-primary animate-pulse" />
                </div>
                <h3 className="font-heading font-black text-sm text-white tracking-tight">
                  Chưa có Video nào được nạp vào bộ xử lý
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Vui lòng tải lên tệp video camera (.mp4, .mkv, .avi) từ máy tính hoặc bấm "Xem Video mẫu Demo" để bắt đầu quét nhận diện biển số xe theo thời gian thực.
                </p>
                <div className="flex items-center justify-center gap-2.5 pt-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-xs transition-all hover:scale-[1.02]"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Tải Video từ máy</span>
                  </button>
                  <button
                    onClick={handleLoadDemo}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-primary" />
                    <span>Xem Video mẫu Demo</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Controls Bar */}
          <div className="bg-surface-muted border border-border p-3.5 rounded-xl space-y-2">
            {/* Scrubber Timeline */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono font-bold text-primary w-12 text-right">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <span className="text-[11px] font-mono text-content-muted w-12">
                {formatTime(duration)}
              </span>
            </div>

            {/* Buttons: Play, Speed, Volume, Info */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="p-2 rounded-lg bg-primary hover:bg-primary-hover text-white transition-all shadow-xs"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 rounded-lg hover:bg-slate-200 text-content-secondary transition-colors"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                {/* Speed Toggles */}
                <div className="flex items-center gap-1 border-l border-border pl-2">
                  {[0.5, 1, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => changeSpeed(rate)}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded-md transition-all ${
                        playbackRate === rate
                          ? "bg-primary text-white"
                          : "bg-surface hover:bg-slate-200 text-content-secondary border border-border"
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Video Name Badge */}
              <div className="flex items-center gap-2 text-xs text-content-muted">
                <FileVideo className="w-3.5 h-3.5 text-primary" />
                <span className="font-semibold text-content-primary truncate max-w-[200px]">
                  {videoFileName}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Plate Detection Feed (4 Cột) */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-3 bg-surface-muted/50 border border-border/80 rounded-2xl p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/80">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" />
                <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-content-primary">
                  Biển số Đã Nhận diện ({detectedPlates.length})
                </h3>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-primary-light text-primary border border-primary-border">
                AUTO-SAVED DB
              </span>
            </div>

            <p className="text-[11px] text-content-muted">
              Bấm vào biển số bên dưới để tự động tua video đến đúng giây xuất hiện:
            </p>

            {/* List of Detected Plates */}
            <div className="space-y-2 overflow-y-auto max-h-[380px] pr-1">
              {detectedPlates.length > 0 ? (
                detectedPlates.map((plate) => (
                  <div
                    key={plate.id}
                    onClick={() => jumpToTime(plate.pts_ms / 1000)}
                    className="p-3 rounded-xl bg-surface border border-border/80 hover:border-primary/50 hover:bg-blue-50/40 cursor-pointer transition-all flex items-center justify-between gap-2.5 shadow-2xs group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative w-12 h-8 rounded-lg overflow-hidden border border-slate-300 bg-slate-200 shrink-0">
                        <Image
                          src={plate.crop_image_url}
                          alt={plate.plate_number}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                          unoptimized
                        />
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <PlateBadge display={plate.plate_display} color={plate.plate_type} />
                          <VehicleBadge type={plate.vehicle_type} />
                        </div>
                        <p className="text-[10px] text-content-muted font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3 text-primary" />
                          Xuất hiện tại {plate.video_time_str} • {plate.province}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono font-bold text-status-success bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                        {(plate.confidence_score * 100).toFixed(0)}%
                      </span>
                      <div className="mt-1">
                        <Link
                          href={`/trace?q=${encodeURIComponent(plate.plate_number)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-0.5 justify-end"
                        >
                          <Compass className="w-3 h-3" />
                          Truy vết
                        </Link>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-content-muted space-y-2 border border-dashed border-border rounded-xl">
                  <Play className="w-6 h-6 text-primary mx-auto opacity-60 animate-bounce" />
                  <p className="font-semibold text-content-primary">Chưa có biển số nào được quét</p>
                  <p className="text-[11px]">Bấm Play video để AI bắt đầu quét và hiển thị kết quả theo thời gian thực</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Metrics Footer */}
          <div className="pt-2 border-t border-border/80 text-[11px] text-content-muted flex items-center justify-between font-mono">
            <span>Dữ liệu đồng bộ: 100% CSDL</span>
            <Link
              href="/plates"
              className="font-bold text-primary hover:underline"
            >
              Mở Kho Biển số →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
