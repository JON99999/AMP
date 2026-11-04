import React from 'react';
import {
  FolderOpen,
  Search,
  RefreshCw,
  XCircle,
  FileText,
  Square,
  Play,
  AlertCircle,
  Plus,
  Edit3,
  Copy,
  Upload
} from 'lucide-react';
import { cn, isAudioFile, isImageFile, getFileExtension } from '../lib/utils';

export interface MediaPickerFile {
  name: string;
  duration?: string | number;
  path?: string;
  size?: string;
}

export interface MediaPickerModalProps {
  isOpen: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  filteredFiles: MediaPickerFile[];
  pickerDurations: Record<string, string>;
  metadataCache: Record<string, any>;
  previewUrl: string | null;
  onTogglePreview: (fileName: string) => void;
  onPreviewScript: (fileName: string) => void;
  onNewCopy?: () => void;
  onEditScript?: (fileName: string) => void;
  onCopyScript?: (fileName: string) => void;
  onSelectFile: (file: MediaPickerFile) => void;
  onClose: () => void;
  onRefresh?: () => Promise<any> | void;
  isRefreshing: boolean;
  isDriveActive: boolean;
}

export const MediaPickerModal: React.FC<MediaPickerModalProps> = ({
  isOpen,
  searchQuery,
  onSearchQueryChange,
  filteredFiles,
  pickerDurations,
  metadataCache,
  previewUrl,
  onTogglePreview,
  onPreviewScript,
  onNewCopy,
  onEditScript,
  onCopyScript,
  onSelectFile,
  onClose,
  onRefresh,
  isRefreshing,
  isDriveActive,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-4 justify-between">
          {/* Left Title block */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-blue-600 p-2 rounded">
              <FolderOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
                Select Announcement
              </h3>
              <p className="text-xs font-bold text-slate-400 mt-1">
                Allowed: .mp3, .txt, .pdf, .png, .jpg, .jpeg
              </p>
            </div>
          </div>

          {/* Middle Search Bar - between Title and close x */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search audio, scripts & images..."
              value={searchQuery}
              onChange={e => onSearchQueryChange(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans"
            />
          </div>

          {/* Right Refresh & Exit */}
          <div className="flex items-center gap-2 shrink-0">
            <button 
              type="button" 
              onClick={onRefresh} 
              className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-full hover:bg-slate-100 transition-colors"
              title="Refresh Files"
            >
              <RefreshCw className={cn("w-4.5 h-4.5", isRefreshing && "animate-spin")} />
            </button>
            <button 
              type="button" 
              onClick={onClose} 
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
              title="Close"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="p-4 pt-3">
          {/* Pinned False Row at the top of the cards */}
          {onNewCopy && (
            <div className="mb-2 p-2 px-3 rounded-lg bg-slate-100/90 border border-slate-300 shadow-xs flex items-center justify-between gap-3 sticky top-0 z-10">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={onNewCopy}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer h-7"
                  title="Create a new .txt Live Read announcement"
                >
                  <span>+ CREATE LIVE READ</span>
                </button>
                <button
                  type="button"
                  onClick={() => {}}
                  className="px-3 py-1.5 bg-white text-slate-500 border border-slate-300 rounded text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-2xs cursor-default h-7"
                  title="Upload File (Placeholder for Roadmap #24)"
                >
                  <Upload className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>+ UPLOAD FILE</span>
                </button>
              </div>
              <span className="text-xs font-bold text-slate-400 hidden sm:inline">
                Create a live read or select an announcement below
              </span>
            </div>
          )}

          <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
            {filteredFiles.length > 0 ? filteredFiles.map((file, i) => {
              const dispDuration = pickerDurations[file.name] || file.duration || '';
              const isAudio = isAudioFile(file.name);
              const ext = getFileExtension(file.name);
              const isEditableTxt = ext === '.txt' || ext === '.md';
              return (
                <div 
                  key={i}
                  className={cn(
                    "w-full text-left p-1.5 px-3 rounded-lg flex items-center transition-all border gap-3 duration-150 shadow-xs",
                    i % 2 === 0
                      ? "bg-white border-slate-300/90 hover:border-blue-600 hover:bg-blue-50/40 hover:ring-1 hover:ring-blue-600/20 hover:shadow-md"
                      : "bg-slate-100 border-slate-300/90 hover:border-blue-600 hover:bg-blue-50/40 hover:ring-1 hover:ring-blue-600/20 hover:shadow-md"
                  )}
                >
                  {/* Left: Select button */}
                  <div className="shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectFile(file)}
                      className="px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer flex items-center justify-center h-7 shrink-0 w-[64px]"
                    >
                      Select
                    </button>
                  </div>

                  {/* Middle: File description and meta info */}
                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <div className="flex flex-wrap items-baseline gap-1.5 leading-tight">
                      <span className="text-xs font-bold line-clamp-1 break-all text-slate-800">
                        {file.name}
                      </span>
                      
                      {/* Audio metadata duration logic */}
                      {isAudio && dispDuration && (
                        <span className="text-xs font-mono font-bold text-slate-400 whitespace-nowrap ml-1">
                          ({dispDuration})
                        </span>
                      )}
                    </div>

                    {/* Display ID3 Metadata and subtitles if cached */}
                    {isAudio && (() => {
                      const meta = metadataCache[file.name];
                      if (meta && (meta.title || meta.artist || meta.album)) {
                        const parts = [meta.title, meta.artist, meta.album].filter(Boolean);
                        return (
                          <p className="text-xs text-slate-500 italic font-medium leading-none mt-0.5">
                            {parts.join(", ")}
                          </p>
                        );
                      }
                      return null;
                    })()}

                    {!isAudio && (
                      <span className="text-xs font-black text-blue-600 uppercase bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded inline-block mt-0.5 font-sans self-start">
                        {ext === '.txt' ? "Plain Text Script" :
                         ext === '.pdf' ? "PDF Document" :
                         ext === '.docx' || ext === '.doc' ? "Word Document" :
                         ext === '.md' ? "Markdown Script" :
                         isImageFile(file.name) ? "Image Asset" : "Script File"}
                      </span>
                    )}
                  </div>

                  {/* Right: Edit, Copy & Preview buttons */}
                  <div className="shrink-0 flex items-center gap-1.5">
                    {isEditableTxt && onEditScript && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditScript(file.name);
                        }}
                        className="rounded text-xs font-bold uppercase tracking-wider transition-all border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 cursor-pointer flex items-center justify-center gap-1 h-7 px-2.5 shrink-0"
                        title="Edit .txt live read"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    )}
                    {!isAudio && onCopyScript && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopyScript(file.name);
                        }}
                        className="rounded text-xs font-bold uppercase tracking-wider transition-all border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 cursor-pointer flex items-center justify-center gap-1 h-7 px-2.5 shrink-0"
                        title={isEditableTxt ? "Copy live read into editor" : "Duplicate live read file"}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </button>
                    )}
                    {!isAudio ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreviewScript(file.name);
                        }}
                        className="rounded text-xs font-bold uppercase tracking-wider transition-all border border-blue-300 text-blue-600 bg-white hover:bg-blue-50 cursor-pointer flex items-center justify-center gap-1.5 h-7 w-[88px] shrink-0"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePreview(file.name);
                        }}
                        className={cn(
                          "rounded text-xs font-bold uppercase tracking-wider transition-all border cursor-pointer flex items-center justify-center gap-1 h-7 w-[88px] shrink-0",
                          previewUrl === file.name 
                            ? "bg-slate-900 text-white border-slate-900" 
                            : "bg-white text-blue-600 border-blue-300 hover:bg-blue-50"
                        )}
                      >
                        {previewUrl === file.name ? (
                          <>
                            <Square className="w-2.5 h-2.5 fill-current" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>Preview</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            }) : (
              <div className="py-12 text-center">
                <AlertCircle className="w-8 h-8 text-amber-500/60 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {isDriveActive ? "No files inside Drive folder" : "No matching resources"}
                </p>
                {isDriveActive && (
                  <p className="text-xs text-slate-400 mt-2 max-w-[225px] mx-auto leading-relaxed uppercase font-bold">
                    Please upload your custom .mp3 files into the Google Drive "medialibrary" folder!
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
