import { useRef, useState } from 'react';
import { CameraIcon, TrashIcon } from '../Icons.js';

export interface PolaroidCardProps {
  imageUrl?: string;
  caption: string;
  dateLabel?: string;
  rotationDeg: number;
  size?: 'large' | 'medium' | 'small';
  mode: 'edit' | 'preview' | 'print';
  placeholderLabel?: string;
  onUploadFile?: (file: File) => void;
  onChangeCaption?: (caption: string, dateLabel?: string) => void;
  onRemove?: () => void;
}

export function PolaroidCard({
  imageUrl,
  caption,
  dateLabel,
  rotationDeg,
  size = 'large',
  mode,
  placeholderLabel = 'Drop a group photo or click to upload',
  onUploadFile,
  onChangeCaption,
  onRemove,
}: PolaroidCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const isEdit = mode === 'edit';

  const handleFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/') || !onUploadFile) return;
    onUploadFile(file);
  };

  return (
    <figure
      className={`sb-polaroid is-${size} sb-has-hover`}
      style={{
        margin: 0,
        transform: `rotate(${rotationDeg}deg)`,
      }}
    >
      <span className="sb-polaroid-tape" aria-hidden="true" />

      <div
        className="sb-polaroid-photo"
        onDragOver={(e) => {
          if (!isEdit) return;
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!isEdit) return;
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          handleFile(e.dataTransfer.files[0]);
        }}
      >
        {imageUrl ? (
          <>
            <img src={imageUrl} alt={caption || 'Family photograph'} />
            {isEdit && (
              <div className="sb-hover-actions sb-edit-only">
                {onUploadFile && (
                  <button
                    type="button"
                    className="sb-float-btn"
                    onClick={() => inputRef.current?.click()}
                  >
                    <CameraIcon size={11} />
                    Replace
                  </button>
                )}
                {onRemove && (
                  <button
                    type="button"
                    className="sb-float-btn is-danger"
                    onClick={onRemove}
                    title="Remove photo"
                  >
                    <TrashIcon size={11} />
                  </button>
                )}
              </div>
            )}
          </>
        ) : isEdit ? (
          <button
            type="button"
            className={`sb-dropzone sb-edit-only ${dragOver ? 'is-drag-over' : ''}`}
            onClick={() => inputRef.current?.click()}
          >
            <CameraIcon size={18} />
            <span>{placeholderLabel}</span>
          </button>
        ) : (
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 12,
              color: '#9b8f80',
              padding: 12,
              textAlign: 'center',
            }}
          >
            Photograph
          </div>
        )}

        {isEdit && onUploadFile && (
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        )}
      </div>

      <figcaption className="sb-polaroid-chin">
        {isEdit && onChangeCaption ? (
          <input
            type="text"
            className="sb-polaroid-caption-input"
            value={caption}
            placeholder="Write a handwritten caption…"
            onChange={(e) => onChangeCaption(e.target.value, dateLabel)}
          />
        ) : (
          <span className="sb-polaroid-caption-text">
            {caption || dateLabel || ''}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
