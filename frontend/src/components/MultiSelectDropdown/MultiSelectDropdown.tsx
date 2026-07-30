import { useState, useEffect, useRef } from "react";
import "./MultiSelectDropdown.css";

interface MultiSelectDropdownProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

export default function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder = "Tất cả",
  searchValue: externalSearchValue,
  onSearchChange: externalOnSearchChange,
  searchPlaceholder = "Tìm kiếm...",
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [internalSearch, setInternalSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Use external search if provided, otherwise use internal search
  const isControlledSearch = externalSearchValue !== undefined;
  const currentSearch = isControlledSearch ? externalSearchValue : internalSearch;

  const handleSearchChange = (val: string) => {
    if (isControlledSearch && externalOnSearchChange) {
      externalOnSearchChange(val);
    } else {
      setInternalSearch(val);
    }
  };

  const filteredOptions = isControlledSearch 
    ? options 
    : options.filter(o => o.label.toLowerCase().includes(internalSearch.toLowerCase()) || o.value.toLowerCase().includes(internalSearch.toLowerCase()));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const triggerLabel =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label || selected[0]
        : `${selected.length} ${label} đã chọn`;

  return (
    <div className="ms-dropdown" ref={ref}>
      <button
        type="button"
        className={`ms-trigger ${open ? "ms-trigger-open" : ""} ${
          selected.length > 0 ? "ms-trigger-active" : ""
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ms-trigger-label">{triggerLabel}</span>
        <span className="material-symbols-outlined ms-arrow">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>
      {open && (
        <div className="ms-panel">
          {(externalOnSearchChange || !isControlledSearch) && (
            <div className="ms-search-container" style={{ padding: '8px', borderBottom: '1px solid #eee' }}>
              <input
                type="text"
                className="ms-search-input"
                style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }}
                placeholder={searchPlaceholder}
                value={currentSearch}
                onChange={(e) => handleSearchChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div className="ms-options-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {filteredOptions.map((opt) => (
              <label key={opt.value} className="ms-option">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
            {filteredOptions.length === 0 && (
              <div style={{ padding: '8px 12px', color: '#666', fontSize: '13px', textAlign: 'center' }}>
                Không có dữ liệu
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
