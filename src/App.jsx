import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
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

  // Функция для получения даты мероприятия в едином формате (timestamp)
  const getEventDate = (event) => {
    // Если есть поле date (timestamp в секундах)
    if (event.date) {
      return event.date;
    }
    // Если есть поле dateTime (ISO строка)
    if (event.dateTime) {
      const date = new Date(event.dateTime);
      if (!isNaN(date.getTime())) {
        return Math.floor(date.getTime() / 1000);
      }
    }
    // Если есть поле timestamp
    if (event.timestamp) {
      return event.timestamp;
    }
    // Если ничего не подошло - возвращаем Infinity, чтобы такие события были в конце
    return Infinity;
  };

  // Функция для сортировки по ближайшей дате
  const sortByNearestDate = (eventsList) => {
    return [...eventsList].sort((a, b) => {
      const dateA = getEventDate(a);
      const dateB = getEventDate(b);
      
      // Сравниваем даты (меньше = раньше = ближе)
      if (dateA === Infinity && dateB === Infinity) return 0;
      if (dateA === Infinity) return 1;
      if (dateB === Infinity) return -1;
      
      return dateA - dateB;
    });
  };

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
        dateTime: new Date(full.date * 1000).toISOString(),
      });
    } catch (err) {
      console.error("Failed to load event:", err);
    }
  };

  // Фильтрация
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

  // Сортировка после фильтрации
  const sortedEvents = sortByNearestDate(filteredEvents);

  return (
    <div className={styles.app}>
      <div className={styles.topPanel}>
        <div className={styles.panelWrapper}>
          <div className={styles.searchWrapper}>
            <Icon icon="lucide:search" width={16} height={16} />
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
            Найдено мероприятий: {sortedEvents.length}
          </div>
        )}

        <div className={styles.eventsGrid}>
          {sortedEvents.map((event) => (
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