import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, Table, Loader2, ChevronDown } from 'lucide-react';
import { apiService } from '../../services/api';

interface ExportButtonProps {
  dataset: 'enquiries' | 'students' | 'batches';
  filters: Record<string, string | undefined>;
  disabled?: boolean;
  label?: string;
  testIdPrefix?: string;
}

const FORMATS: { key: 'csv' | 'xlsx' | 'pdf'; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { key: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet, description: 'Formatted workbook with filters & auto-filter headers' },
  { key: 'csv', label: 'CSV (.csv)', icon: Table, description: 'Raw rows for spreadsheets & data imports' },
  { key: 'pdf', label: 'PDF Report', icon: FileText, description: 'Branded SSCI report with page numbers' },
];

export const ExportButton: React.FC<ExportButtonProps> = ({
  dataset,
  filters,
  disabled,
  label = 'Export',
  testIdPrefix = 'export',
}) => {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, []);

  const trigger = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setError(null);
    setDownloading(format);
    const result = await apiService.downloadExport(dataset, format, filters);
    setDownloading(null);
    if (!result.success) {
      setError(result.message || 'Export failed.');
      return;
    }
    setOpen(false);
  };

  const activeFilterCount = Object.values(filters).filter((v) => v !== undefined && v !== null && v !== '').length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="py-2 px-3.5 rounded-xl bg-white border border-teal-200 text-[#087F78] hover:bg-teal-50 text-xs font-bold shadow-xs flex items-center gap-1.5 disabled:opacity-60"
        data-testid={`${testIdPrefix}-trigger-button`}
      >
        <Download className="w-3.5 h-3.5" />
        <span>{label}</span>
        {activeFilterCount > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-teal-100 text-[#087F78] text-[10px] font-extrabold">
            {activeFilterCount}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-teal-100 py-2 z-40 animate-fadeIn"
          data-testid={`${testIdPrefix}-menu`}
        >
          <div className="px-4 py-2 border-b border-gray-100">
            <h4 className="text-xs font-bold text-[#123B3A]">Download as</h4>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {activeFilterCount > 0 ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'} will be applied.` : 'No filters active — exporting all records.'}
            </p>
          </div>
          <div className="py-1">
            {FORMATS.map(({ key, label: fmtLabel, icon: Icon, description }) => (
              <button
                key={key}
                type="button"
                onClick={() => trigger(key)}
                disabled={downloading !== null}
                className="w-full text-left px-4 py-2.5 hover:bg-teal-50/70 transition-colors flex items-start gap-3 disabled:opacity-60"
                data-testid={`${testIdPrefix}-${key}-button`}
              >
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#087F78] flex items-center justify-center shrink-0">
                  {downloading === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#123B3A]">{fmtLabel}</p>
                  <p className="text-[10px] text-gray-500 leading-snug">{description}</p>
                </div>
              </button>
            ))}
          </div>
          {error && (
            <div className="px-4 py-2 border-t border-red-100 bg-red-50 text-red-700 text-[11px] font-semibold" data-testid={`${testIdPrefix}-error`}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
