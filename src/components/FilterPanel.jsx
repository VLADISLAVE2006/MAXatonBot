import React, { useState, useRef, useEffect } from "react";

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
        { value: "online", label: "🖥 Онлайн" },
        { value: "offline", label: "🏢 Оффлайн" },
    ];

    const typeOptions = [
        { value: "hackathon", label: "🚀 Хакатон" },
        { value: "olympiad", label: "🏆 Олимпиада" },
        { value: "conference", label: "🎤 Конференция" },
        { value: "openday", label: "🚪 День открытых дверей" },
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
            background: "white",
            border: "none",
            padding: "8px 20px",
            borderRadius: "40px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            fontSize: "14px",
            color: "#1e4663",
            border: "1px solid #cce3ff",
            whiteSpace: "nowrap",
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
            position: "fixed",
            top: "0",
            left: "50%",
            transform: "translateX(15%)",
            background: "white",
            borderRadius: "20px",
            width: "350px",
            maxWidth: "90%",
            zIndex: 9999,
            boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        },
        modalHeader: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "15px 20px",
            borderBottom: "1px solid #eee",
        },
        closeBtn: {
            background: "#f0f0f0",
            border: "none",
            width: "30px",
            height: "30px",
            borderRadius: "50%",
            cursor: "pointer",
            fontSize: "14px",
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
            color: "#2c6e9e",
        },
        chips: {
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
        },
        chip: {
            background: "#f0f4fa",
            border: "1px solid #d4e2f0",
            padding: "6px 14px",
            borderRadius: "40px",
            cursor: "pointer",
            fontSize: "13px",
        },
        chipActive: {
            background: "#2c7ab1",
            color: "white",
            border: "1px solid #2c7ab1",
        },
        modalFooter: {
            display: "flex",
            gap: "10px",
            padding: "15px 20px",
            borderTop: "1px solid #eee",
        },
        resetBtn: {
            flex: 1,
            padding: "8px",
            borderRadius: "40px",
            cursor: "pointer",
            border: "none",
            fontSize: "14px",
            background: "#f0f4fa",
        },
        applyBtn: {
            flex: 1,
            padding: "8px",
            borderRadius: "40px",
            cursor: "pointer",
            border: "none",
            fontSize: "14px",
            background: "#2c7ab1",
            color: "white",
        },
    };

    return (
        <>
            <button
                style={styles.filterBtn}
                onClick={() => setIsOpen(true)}>
                <i className="fas fa-sliders-h"></i>
                <span>Фильтры</span>
                {activeFiltersCount > 0 && <span style={styles.badge}>{activeFiltersCount}</span>}
            </button>

            {isOpen && (
                <div
                    style={styles.modal}
                    ref={modalRef}>
                    <div style={styles.modalHeader}>
                        <h3 style={{ margin: 0 }}>Фильтры</h3>
                        <button
                            style={styles.closeBtn}
                            onClick={() => setIsOpen(false)}>
                            <i className="fas fa-times"></i>
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
        </>
    );
};

export default FilterPanel;
