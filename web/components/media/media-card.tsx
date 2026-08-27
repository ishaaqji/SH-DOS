"use client";

import { Icon } from "../ui/icons";
import { Badge } from "../ui/badge";
import { mediaLabel, formatBytes } from "@/lib/media";
import type { MediaReference } from "@/lib/types";

interface MediaCardProps {
  media: MediaReference;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

function KindThumb({ media }: { media: MediaReference }) {
  if (media.kind === "image") {
    return (
      <img
        src={media.url}
        alt={media.alt ?? ""}
        className="media-thumb-img"
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }
  const icon = media.kind === "video" ? "media" : media.kind === "audio" ? "activity" : "file";
  return <Icon name={icon} size={28} />;
}

export function MediaCard({ media, selected, onToggle, onOpen }: MediaCardProps) {
  return (
    <button
      type="button"
      className={["media-card", selected ? "media-card-selected" : ""].filter(Boolean).join(" ")}
      onClick={onOpen}
      aria-label={`Open ${mediaLabel(media)}`}
    >
      <span className="media-thumb">
        <KindThumb media={media} />
        <span className="media-kind-badge">
          <Badge variant="neutral">{media.kind}</Badge>
        </span>
      </span>
      <span className="media-card-body">
        <span className="media-card-name" title={mediaLabel(media)}>
          {mediaLabel(media)}
        </span>
        <span className="media-card-meta">
          {formatBytes(media.sizeBytes)}
          {media.width && media.height ? ` · ${media.width}×${media.height}` : ""}
        </span>
      </span>
      <span
        className="media-checkbox"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select ${mediaLabel(media)}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {selected && <Icon name="check" size={13} />}
      </span>
    </button>
  );
}
