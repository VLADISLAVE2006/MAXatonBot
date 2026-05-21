import React, { useState, useEffect } from 'react';
import styles from './App.module.scss';
import EventCard from './components/EventCard';
import FilterPanel from './components/FilterPanel';
import EventModal from './components/EventModal';
import { loadAllEvents } from './data/eventsData';

function App() {
  const [events, setEvents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    format: [],
    type: [],
  });
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    loadEvents();
    
    const handleStorageChange = (e) => {
      if (e.key === 'all_events') {
        loadEvents();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const loadEvents = () => {
    const allEvents = loadAllEvents();
    setEvents(allEvents);
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
        <div className={styles.counter}>
          Найдено мероприятий: {filteredEvents.length}
        </div>

        <div className={styles.eventsGrid}>
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onClick={() => setSelectedEvent(event)}
            />
          ))}
        </div>
      </div>

      {selectedEvent && (
        <div className={styles.modalOverlay} onClick={() => setSelectedEvent(null)}>
          <div className={styles.modalWrapper} onClick={(e) => e.stopPropagation()}>
            <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;