import { useState, useRef, useEffect } from "react";
import { Icon } from "@iconify/react";

const FilterPanel = ({ filters, setFilters }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [tempFilters, setTempFilters] = useState({ format: [], type: [] });
    const modalRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setTempFilters({ format: [...filters.format], type: [...filters.type] });
        }
    }, [isOpen, filters.format, filters.type]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (modalRef.current && !modalRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen]);

    const formatOptions = [
        { value: "online", label: "Онлайн", icon: "lucide:monitor" },
        { value: "offline", label: "Оффлайн", icon: "lucide:building-2" },
    ];

    const typeOptions = [
        { value: "hackathon", label: "Хакатон", icon: "lucide:rocket" },
        { value: "olympiad", label: "Олимпиада", icon: "lucide:trophy" },
        { value: "conference", label: "Конференция", icon: "lucide:mic" },
        { value: "openday", label: "День открытых дверей", icon: "lucide:door-open" },
    ];

    const toggleTempFormat = (value) => {
        setTempFilters((prev) => ({
            ...prev,
            format: prev.format.includes(value) ? prev.format.filter((f) => f !== value) : [...prev.format, value],
        }));
    };

    const toggleTempType = (value) => {
        setTempFilters((prev) => ({
            ...prev,
            type: prev.type.includes(value) ? prev.type.filter((t) => t !== value) : [...prev.type, value],
        }));
    };

    const applyFilters = () => {
        setFilters({ format: [...tempFilters.format], type: [...tempFilters.type] });
        setIsOpen(false);
    };

    const resetTempFilters = () => {
        setTempFilters({ format: [], type: [] });
    };

    const activeFiltersCount = filters.format.length + filters.type.length;

    const styles = {
        filterBtn: {
            background: "var(--btn-filter, white)",
            border: "none",
            padding: "8px 20px",
            borderRadius: "40px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            fontSize: "14px",
            color: "var(--btn-filter-text, #1e4663)",
            border: "1px solid var(--btn-filter-border, #cce3ff)",
            whiteSpace: "nowrap",
            transition: "all 0.2s ease",
        },
        badge: {
            background: "#2c7ab1",
            color: "white",
            borderRadius: "30px",
            padding: "2px 8px",
            fontSize: "11px",
            marginLeft: "5px",
        },
        modal: {
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            background: "var(--bg-modal, white)",
            borderRadius: "20px",
            width: "320px",
            maxWidth: "90vw",
            zIndex: 9999,
            boxShadow: "var(--shadow-modal, 0 10px 40px rgba(0,0,0,0.2))",
        },
        modalHeader: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "15px 20px",
            borderBottom: "1px solid var(--border-light, #eee)",
        },
        closeBtn: {
            background: "var(--bg-chip, #f0f4fa)",
            border: "none",
            width: "30px",
            height: "30px",
            borderRadius: "50%",
            cursor: "pointer",
            color: "var(--text-primary, #333)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
        },
        modalBody: {
            padding: "20px",
            maxHeight: "400px",
            overflowY: "auto",
        },
        section: {
            marginBottom: "20px",
        },
        sectionTitle: {
            fontWeight: "600",
            marginBottom: "10px",
            fontSize: "14px",
            color: "var(--chip-active, #2c6e9e)",
        },
        chips: {
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
        },
        chip: {
            background: "var(--bg-chip, #f0f4fa)",
            border: "1px solid var(--border-chip, #d4e2f0)",
            padding: "6px 14px",
            borderRadius: "40px",
            cursor: "pointer",
            fontSize: "13px",
            color: "var(--text-chip, #2c4d6e)",
            transition: "all 0.2s ease",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            "&:hover": {
                background: "var(--btn-filter-hover, #eef3fc)",
            },
        },
        chipActive: {
            background: "var(--chip-active, #2c7ab1)",
            color: "white",
            border: "1px solid var(--chip-active, #2c7ab1)",
        },
        modalFooter: {
            display: "flex",
            gap: "10px",
            padding: "15px 20px",
            borderTop: "1px solid var(--border-light, #eee)",
        },
        resetBtn: {
            flex: 1,
            padding: "8px",
            borderRadius: "40px",
            cursor: "pointer",
            border: "none",
            fontSize: "14px",
            fontWeight: "500",
            background: "var(--btn-secondary, #f0f4fa)",
            color: "var(--btn-secondary-text, #4a6f8f)",
            transition: "all 0.2s ease",
        },
        applyBtn: {
            flex: 1,
            padding: "8px",
            borderRadius: "40px",
            cursor: "pointer",
            border: "none",
            fontSize: "14px",
            fontWeight: "600",
            background: "var(--btn-primary, #2c7ab1)",
            color: "var(--btn-primary-text, white)",
            transition: "all 0.2s ease",
        },
    };

    return (
        <div style={{ position: "relative", display: "inline-block" }}>
            <button
                style={styles.filterBtn}
                onClick={() => setIsOpen(true)}>
                <Icon icon="lucide:sliders-horizontal" width={16} height={16} />
                <span>Фильтры</span>
                {activeFiltersCount > 0 && <span style={styles.badge}>{activeFiltersCount}</span>}
            </button>

            {isOpen && (
                    <div style={styles.modal} ref={modalRef}>
                        <div style={styles.modalHeader}>
                            <h3 style={{ margin: 0, color: "var(--text-primary, #1a3d5c)" }}>Фильтры</h3>
                            <button
                                style={styles.closeBtn}
                                onClick={() => setIsOpen(false)}>
                                <Icon icon="lucide:x" width={16} height={16} />
                            </button>
                        </div>

                        <div style={styles.modalBody}>
                            <div style={styles.section}>
                                <div style={styles.sectionTitle}>Формат проведения</div>
                                <div style={styles.chips}>
                                    {formatOptions.map((opt) => (
                                        <button
                                            key={opt.value}
                                            style={{
                                                ...styles.chip,
                                                ...(tempFilters.format.includes(opt.value) ? styles.chipActive : {}),
                                            }}
                                            onClick={() => toggleTempFormat(opt.value)}>
                                            <Icon icon={opt.icon} width={14} height={14} />
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={styles.section}>
                                <div style={styles.sectionTitle}>Тип мероприятия</div>
                                <div style={styles.chips}>
                                    {typeOptions.map((opt) => (
                                        <button
                                            key={opt.value}
                                            style={{
                                                ...styles.chip,
                                                ...(tempFilters.type.includes(opt.value) ? styles.chipActive : {}),
                                            }}
                                            onClick={() => toggleTempType(opt.value)}>
                                            <Icon icon={opt.icon} width={14} height={14} />
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div style={styles.modalFooter}>
                            <button
                                style={styles.resetBtn}
                                onClick={resetTempFilters}>
                                Сбросить все
                            </button>
                            <button
                                style={styles.applyBtn}
                                onClick={applyFilters}>
                                Применить
                            </button>
                        </div>
                    </div>
            )}
        </div>
    );
};

export default FilterPanel;