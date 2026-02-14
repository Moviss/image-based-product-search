"use client";

import { useRef, useState, useCallback } from "react";
import Image from "next/image";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
} from "@/lib/schemas";

export interface FileWithPreview {
  file: File;
  previewUrl: string;
}

interface ImageUploadProps {
  value: FileWithPreview | null;
  onChange: (value: FileWithPreview | null) => void;
  disabled?: boolean;
}

function validateFile(file: File): string | null {
  if (
    !ALLOWED_IMAGE_TYPES.includes(
      file.type as (typeof ALLOWED_IMAGE_TYPES)[number],
    )
  ) {
    return `Invalid format. Allowed: JPEG, PNG, WebP.`;
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.`;
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageUpload({ value, onChange, disabled }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    (f: File) => {
      const validationError = validateFile(f);
      if (validationError) {
        setError(validationError);
        if (value) {
          URL.revokeObjectURL(value.previewUrl);
          onChange(null);
        }
      } else {
        setError(null);
        if (value) URL.revokeObjectURL(value.previewUrl);
        onChange({ file: f, previewUrl: URL.createObjectURL(f) });
      }
    },
    [onChange, value],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleRemove = () => {
    setError(null);
    if (value) {
      URL.revokeObjectURL(value.previewUrl);
      onChange(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  if (value) {
    return (
      <div className="relative rounded-lg border border-border p-4">
        <div className="flex items-start gap-4">
          <Image
            src={value.previewUrl}
            alt="Upload preview"
            width={128}
            height={128}
            className="h-32 w-32 rounded-md object-cover"
            unoptimized
          />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium">{value.file.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatFileSize(value.file.size)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleRemove}
            disabled={disabled}
            aria-label="Remove image"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <Upload className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">Drag & drop or click to browse</p>
        <p className="text-xs text-muted-foreground">
          JPEG, PNG, or WebP up to 10 MB
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleInputChange}
        className="hidden"
        aria-hidden="true"
      />
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
