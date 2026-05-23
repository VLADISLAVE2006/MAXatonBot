import React, { useState, useEffect } from "react";
import styles from "./App.module.scss";
import EventCard from "./components/EventCard";
import FilterPanel from "./components/FilterPanel";
import EventModal from "./components/EventModal";
import { api } from "./api";

function App() {
  const [events, setEvents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({ format: [], type: [] });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.events
      .getAll()
      .then(setEvents)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleCardClick = async (event) => {
    try {
      const full = await api.events.getById(event.id);
      setSelectedEvent({
        ...full,
        location: full.content,
        totalSeats: full.max_slots,
        remainingSeats:
          full.max_slots != null
            ? full.max_slots - full.registered_count
            : null,
        dateTime: new Date(full.date * 1000).toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    } catch (err) {
      console.error("Failed to load event:", err);
    }
  };

  const filteredEvents = events.filter((event) => {
    const matchesSearch = event.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesFormat =
      filters.format.length === 0 || filters.format.includes(event.format);
    const matchesType =
      filters.type.length === 0 || filters.type.includes(event.type);
    return matchesSearch && matchesFormat && matchesType;
  });

  return (
    <div className={styles.app}>
      <div className={styles.topPanel}>
        <div className={styles.panelWrapper}>
          <div className={styles.searchWrapper}>
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Поиск мероприятий..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <FilterPanel filters={filters} setFilters={setFilters} />
        </div>
      </div>

      <div className={styles.container}>
        {loading && <div className={styles.counter}>Загрузка...</div>}
        {error && <div className={styles.counter}>Ошибка: {error}</div>}
        {!loading && !error && (
          <div className={styles.counter}>
            Найдено мероприятий: {filteredEvents.length}
          </div>
        )}

        <div className={styles.eventsGrid}>
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onClick={() => handleCardClick(event)}
            />
          ))}
        </div>
      </div>

      {selectedEvent && (
        <div
          className={styles.modalOverlay}
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className={styles.modalWrapper}
            onClick={(e) => e.stopPropagation()}
          >
            <EventModal
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
