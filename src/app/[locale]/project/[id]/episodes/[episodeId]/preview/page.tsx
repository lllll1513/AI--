"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useParams } from "next/navigation";
import {
  useProjectStore,
  getKeyframeVideoUrl,
  getReferenceVideoUrl,
  getSceneRefFrameUrl,
  getFirstFrameUrl,
  getLastFrameUrl,
  getReferenceAssets,
  type Shot,
} from "@/stores/project-store";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { uploadUrl } from "@/lib/utils/upload-url";
import {
  Sparkles,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Play,
  Monitor,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Circle,
  Scissors,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";

export default function EpisodePreviewPage() {
  const t = useTranslations();
  const { project, fetchProject } = useProjectStore();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string; episodeId: string }>();
  const versionId = searchParams.get("versionId");
  const activeEpisodeId = useProjectStore((s) => s.currentEpisodeId) ?? params?.episodeId;

  useEffect(() => {
    if (versionId && params?.id && params?.episodeId) {
      fetchProject(params.id, params.episodeId, versionId);
    }
  }, [versionId, params?.id, params?.episodeId, fetchProject]);

  const [assembling, setAssembling] = useState(false);
  const [selectedShot, setSelectedShot] = useState(0);
  const [videoValid, setVideoValid] = useState<boolean | null>(null);
  const [updatingShotId, setUpdatingShotId] = useState<string | null>(null);
  const checkedUrl = useRef<string | null>(null);

  const finalVideoUrl = project?.finalVideoUrl ?? null;
  const generationMode = project?.generationMode ?? "keyframe";

  // Which mode's videos to preview — default to the project's generationMode
  const hasKeyframeVideos = project?.shots.some((s) => getKeyframeVideoUrl(s)) ?? false;
  const hasReferenceVideos = project?.shots.some((s) => getReferenceVideoUrl(s)) ?? false;
  const hasBothModes = hasKeyframeVideos && hasReferenceVideos;

  const [previewMode, setPreviewMode] = useState<"keyframe" | "reference">(generationMode);

  // Sync previewMode when project loads
  useEffect(() => {
    setPreviewMode(generationMode);
  }, [generationMode]);

  // Check if final video file actually exists
  useEffect(() => {
    if (!finalVideoUrl) { setVideoValid(null); return; }
    if (checkedUrl.current === finalVideoUrl) return;
    checkedUrl.current = finalVideoUrl;
    fetch(uploadUrl(finalVideoUrl), { method: "HEAD" })
      .then((res) => setVideoValid(res.ok))
      .catch(() => setVideoValid(false));
  }, [finalVideoUrl]);

  if (!project) return null;

  const getVideoUrl = (shot: typeof project.shots[0]) =>
    previewMode === "reference" ? getReferenceVideoUrl(shot) : getKeyframeVideoUrl(shot);

  const getThumbnail = (shot: typeof project.shots[0]) =>
    previewMode === "reference" ? getSceneRefFrameUrl(shot) : getFirstFrameUrl(shot);

  const getShotReadiness = (shot: Shot) => {
    const hasVideo = !!getVideoUrl(shot);
    const hasPrompt = !!shot.videoPrompt?.trim();
    const hasMotion = !!shot.motionScript?.trim();
    const hasVisualAnchor = previewMode === "reference"
      ? getReferenceAssets(shot).some((asset) => !!asset.fileUrl)
      : !!(getFirstFrameUrl(shot) && getLastFrameUrl(shot));
    const canCut = hasVideo && shot.includeInFinal !== 0 && shot.productionStatus !== "rejected" && shot.productionStatus !== "needs_fix";
    const issues = [
      !hasVisualAnchor ? "缺少参考素材" : null,
      !hasPrompt ? "缺少视频提示词" : null,
      !hasMotion ? "动作提示偏弱" : null,
      !hasVideo ? "还没有视频片段" : null,
    ].filter((issue): issue is string => Boolean(issue));
    const suggestedStatus = issues.length === 0 ? "approved" : "needs_fix";
    return { hasVideo, hasPrompt, hasMotion, hasVisualAnchor, canCut, issues, suggestedStatus };
  };

  const reviewRows = project.shots.map((shot) => ({
    shot,
    ...getShotReadiness(shot),
  }));
  const shotsWithVideo = project.shots.filter((s) => getVideoUrl(s));
  const completedVideos = shotsWithVideo.length;
  const eligibleVideos = reviewRows.filter((row) => row.canCut).length;
  const approvedShots = reviewRows.filter((row) => row.shot.productionStatus === "approved").length;
  const needsFixShots = reviewRows.filter((row) => row.shot.productionStatus === "needs_fix").length;
  const rejectedShots = reviewRows.filter((row) => row.shot.productionStatus === "rejected").length;
  const missingVideoShots = reviewRows.filter((row) => !row.hasVideo).length;
  const suggestedApprovedShots = reviewRows.filter((row) => row.suggestedStatus === "approved").length;
  const suggestedFixShots = reviewRows.filter((row) => row.suggestedStatus === "needs_fix").length;
  const currentShot = shotsWithVideo[selectedShot];
  const hasValidVideo = finalVideoUrl && videoValid === true;

  async function handleAssemble() {
    if (!project) return;
    setAssembling(true);
    checkedUrl.current = null;
    try {
      const res = await apiFetch(`/api/projects/${project.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "video_assemble", payload: versionId ? { versionId } : undefined, episodeId: activeEpisodeId }),
      });
      const data = await res.json();
      if (!res.ok || data?.status === "error") {
        throw new Error(data?.error || data?.message || "合成失败");
      }
    } catch (err) {
      console.error("Video assemble error:", err);
      toast.error(err instanceof Error ? err.message : t("common.generationFailed"));
    }
    setAssembling(false);
    await fetchProject(project.id, activeEpisodeId);
  }

  function handleDownload() {
    if (!hasValidVideo) return;
    const a = document.createElement("a");
    a.href = uploadUrl(finalVideoUrl!);
    a.download = `${project!.title || "video"}-final.mp4`;
    a.click();
  }

  function handleModeSwitch(mode: "keyframe" | "reference") {
    setPreviewMode(mode);
    setSelectedShot(0);
  }

  async function updateShotReview(
    shot: Shot,
    patch: {
      includeInFinal: number;
      productionStatus: "unchecked" | "approved" | "needs_fix" | "rejected";
      qualityIssues?: string[];
    }
  ) {
    if (!project) return;
    setUpdatingShotId(shot.id);
    try {
      const res = await apiFetch(`/api/projects/${project.id}/shots/${shot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includeInFinal: patch.includeInFinal,
          productionStatus: patch.productionStatus,
          qualityIssues: JSON.stringify(patch.qualityIssues ?? []),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchProject(project.id, activeEpisodeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "质检状态保存失败");
    } finally {
      setUpdatingShotId(null);
    }
  }

  async function batchUpdateReview(
    targets: Shot[],
    patch: {
      includeInFinal: number;
      productionStatus: "unchecked" | "approved" | "needs_fix" | "rejected";
      qualityIssues?: string[];
    }
  ) {
    if (!project || targets.length === 0) return;
    setUpdatingShotId("batch");
    try {
      await Promise.all(targets.map(async (shot) => {
        const res = await apiFetch(`/api/projects/${project.id}/shots/${shot.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            includeInFinal: patch.includeInFinal,
            productionStatus: patch.productionStatus,
            qualityIssues: JSON.stringify(patch.qualityIssues ?? []),
          }),
        });
        if (!res.ok) throw new Error(await res.text());
      }));
      await fetchProject(project.id, activeEpisodeId);
      toast.success("质检状态已批量更新");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量更新失败");
    } finally {
      setUpdatingShotId(null);
    }
  }

  async function applySuggestedReview() {
    if (!project || reviewRows.length === 0) return;
    setUpdatingShotId("batch");
    try {
      await Promise.all(reviewRows.map(async (row) => {
        const suggestedApproved = row.suggestedStatus === "approved";
        const res = await apiFetch(`/api/projects/${project.id}/shots/${row.shot.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            includeInFinal: suggestedApproved ? 1 : 0,
            productionStatus: suggestedApproved ? "approved" : "needs_fix",
            qualityIssues: JSON.stringify(row.issues),
          }),
        });
        if (!res.ok) throw new Error(await res.text());
      }));
      await fetchProject(project.id, activeEpisodeId);
      toast.success("已按自动建议标记镜头");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "自动建议应用失败");
    } finally {
      setUpdatingShotId(null);
    }
  }

  function ReviewIcon({ row }: { row: (typeof reviewRows)[number] }) {
    if (row.shot.productionStatus === "approved") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (row.shot.productionStatus === "needs_fix") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    if (row.shot.productionStatus === "rejected") return <XCircle className="h-4 w-4 text-red-500" />;
    if (row.hasVideo) return <Circle className="h-4 w-4 text-slate-400" />;
    return <AlertTriangle className="h-4 w-4 text-slate-300" />;
  }

  return (
    <div className="animate-page-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Monitor className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-[--text-primary]">
              {t("project.preview")}
            </h2>
            <p className="text-xs text-[--text-muted]">
              {t("project.shotsCompleted", {
                completed: completedVideos,
                total: project.shots.length,
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasValidVideo && (
            <Button onClick={handleDownload} size="sm" variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-100">
              <Download className="h-3.5 w-3.5" />
              {t("project.downloadVideo")}
            </Button>
          )}
          <Button
            onClick={handleAssemble}
            disabled={assembling || eligibleVideos === 0}
            size="sm"
          >
            {assembling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {assembling ? t("common.generating") : "合成通过镜头"}
          </Button>
        </div>
      </div>

      {/* Production review board */}
      <section className="space-y-3 rounded-2xl border border-[--border-subtle] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
              <Scissors className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[--text-primary]">剪辑前检查</h3>
              <p className="text-xs text-[--text-muted]">
                {eligibleVideos} 条可进成片，{missingVideoShots} 条缺视频，{needsFixShots + rejectedShots} 条已拦截
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">通过 {approvedShots}</span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">待修 {needsFixShots}</span>
            <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">排除 {rejectedShots}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">有视频 {completedVideos}/{project.shots.length}</span>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700">建议通过 {suggestedApprovedShots}</span>
            <span className="rounded-full bg-orange-50 px-2.5 py-1 font-medium text-orange-700">建议待修 {suggestedFixShots}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={updatingShotId === "batch" || project.shots.length === 0}
            onClick={applySuggestedReview}
            className="border-sky-200 text-sky-700 hover:bg-sky-50"
          >
            按建议标记
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={updatingShotId === "batch" || completedVideos === 0}
            onClick={() => batchUpdateReview(
              reviewRows.filter((row) => row.hasVideo).map((row) => row.shot),
              { includeInFinal: 1, productionStatus: "approved", qualityIssues: [] }
            )}
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          >
            有视频全部通过
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={updatingShotId === "batch" || project.shots.length === 0}
            onClick={() => batchUpdateReview(
              project.shots,
              { includeInFinal: 1, productionStatus: "unchecked", qualityIssues: [] }
            )}
          >
            清空标记
          </Button>
        </div>

        <div className="grid gap-2">
          {reviewRows.map((row) => {
            const shot = row.shot;
            const isUpdating = updatingShotId === shot.id;
            const statusLabel =
              shot.productionStatus === "approved" ? "通过"
              : shot.productionStatus === "needs_fix" ? "待修"
              : shot.productionStatus === "rejected" ? "排除"
              : "未检查";
            const suggestedLabel = row.suggestedStatus === "approved" ? "建议通过" : "建议待修";
            return (
              <div
                key={shot.id}
                className={cn(
                  "grid gap-3 rounded-xl border px-3 py-2.5 md:grid-cols-[auto_1fr_auto] md:items-center",
                  row.canCut
                    ? "border-emerald-100 bg-emerald-50/35"
                    : shot.productionStatus === "needs_fix"
                      ? "border-amber-100 bg-amber-50/40"
                      : shot.productionStatus === "rejected"
                        ? "border-red-100 bg-red-50/35"
                        : "border-[--border-subtle] bg-[--surface]/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <ReviewIcon row={row} />
                  <span className="font-mono text-xs font-semibold text-[--text-secondary]">
                    #{shot.sequence}
                  </span>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-[--text-muted]">
                    {statusLabel}
                  </span>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    row.suggestedStatus === "approved"
                      ? "bg-sky-50 text-sky-700"
                      : "bg-orange-50 text-orange-700"
                  )}>
                    {suggestedLabel}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[--text-primary]">
                    {shot.prompt || shot.videoScript || "未命名镜头"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                    <span className={cn("rounded-full px-2 py-0.5", row.hasVisualAnchor ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                      素材 {row.hasVisualAnchor ? "齐" : "缺"}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5", row.hasPrompt ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                      提示词 {row.hasPrompt ? "有" : "缺"}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5", row.hasMotion ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                      动作 {row.hasMotion ? "有" : "弱"}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5", row.hasVideo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                      视频 {row.hasVideo ? "完成" : "未生成"}
                    </span>
                    {row.issues.map((issue) => (
                      <span key={issue} className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-700">
                        {issue}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="xs"
                    variant={shot.productionStatus === "approved" ? "default" : "outline"}
                    disabled={isUpdating || !row.hasVideo}
                    onClick={() => updateShotReview(shot, {
                      includeInFinal: 1,
                      productionStatus: "approved",
                      qualityIssues: [],
                    })}
                  >
                    通过
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={isUpdating}
                    onClick={() => updateShotReview(shot, {
                      includeInFinal: 0,
                      productionStatus: "needs_fix",
                      qualityIssues: ["需要重生成或人工检查"],
                    })}
                    className="border-amber-200 text-amber-700 hover:bg-amber-50"
                  >
                    待修
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={isUpdating}
                    onClick={() => updateShotReview(shot, {
                      includeInFinal: 0,
                      productionStatus: "rejected",
                      qualityIssues: ["不进入最终合成"],
                    })}
                    className="border-red-200 text-red-700 hover:bg-red-50"
                  >
                    排除
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Mode switcher — only shown when both modes have videos */}
      {hasBothModes && (
        <div className="flex items-center gap-1 rounded-xl border border-[--border-subtle] bg-[--surface] p-1 w-fit">
          <button
            onClick={() => handleModeSwitch("keyframe")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150",
              previewMode === "keyframe"
                ? "bg-white text-primary shadow ring-1 ring-primary/20"
                : "text-[--text-muted] hover:bg-white/60 hover:text-[--text-secondary]"
            )}
          >
            {t("project.generationModeKeyframe")}
          </button>
          <button
            onClick={() => handleModeSwitch("reference")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150",
              previewMode === "reference"
                ? "bg-white text-primary shadow ring-1 ring-primary/20"
                : "text-[--text-muted] hover:bg-white/60 hover:text-[--text-secondary]"
            )}
          >
            {t("project.generationModeReference")}
          </button>
        </div>
      )}

      {/* Final video player */}
      {hasValidVideo && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-black shadow-2xl shadow-black/40">
            <video
              key={finalVideoUrl!}
              controls
              autoPlay
              className="aspect-video w-full"
              src={uploadUrl(finalVideoUrl!)}
            />
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5">
            <span className="text-sm font-medium text-emerald-700">{t("project.finalVideo")}</span>
            <span className="text-xs text-emerald-600/70">{t("project.finalVideoHint")}</span>
          </div>
        </div>
      )}

      {/* Shot clips player */}
      {shotsWithVideo.length > 0 && currentShot ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-[--border-subtle] bg-black shadow-2xl shadow-black/40">
            <video
              key={currentShot.id + previewMode}
              controls
              autoPlay={!hasValidVideo}
              className="aspect-video w-full"
              src={uploadUrl(getVideoUrl(currentShot)!)}
            />
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setSelectedShot(Math.max(0, selectedShot - 1))}
              disabled={selectedShot === 0}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[--text-muted] transition-all hover:bg-[--surface-hover] hover:text-[--text-primary] disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono text-sm font-medium text-[--text-secondary]">
              {selectedShot + 1} / {shotsWithVideo.length}
            </span>
            <button
              onClick={() =>
                setSelectedShot(Math.min(shotsWithVideo.length - 1, selectedShot + 1))
              }
              disabled={selectedShot === shotsWithVideo.length - 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[--text-muted] transition-all hover:bg-[--surface-hover] hover:text-[--text-primary] disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Thumbnail timeline */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {shotsWithVideo.map((shot, i) => {
              const thumb = getThumbnail(shot);
              return (
                <button
                  key={shot.id}
                  onClick={() => setSelectedShot(i)}
                  className={cn(
                    "flex-shrink-0 overflow-hidden rounded-xl border-2 transition-all duration-200",
                    i === selectedShot
                      ? "border-primary shadow-lg shadow-primary/20 scale-[1.03]"
                      : "border-[--border-subtle] hover:border-[--border-hover] opacity-70 hover:opacity-100"
                  )}
                >
                  <div className="relative h-14 w-22">
                    {thumb ? (
                      <img
                        src={uploadUrl(thumb)}
                        alt={`Shot ${shot.sequence}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[--surface]">
                        <Play className="h-3 w-3 text-[--text-muted]" />
                      </div>
                    )}
                    <span className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white backdrop-blur-sm">
                      {shot.sequence}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[--border-subtle] bg-[--surface]/50 py-24">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10">
            <Play className="h-7 w-7 text-primary" />
          </div>
          <p className="max-w-sm text-center text-sm text-[--text-secondary]">
            {t("shot.noShots")}
          </p>
        </div>
      )}
    </div>
  );
}
