import React, { useState, useEffect } from 'react';
import styles from './OrganizerApp.module.scss';
import EventCard from './components/EventCard';
import FilterPanel from './components/FilterPanel';
import EventModalOrganizer from './components/EventModalOrganizer';
import CreateEventModal from './components/CreateEventModal';
import { loadAllEvents, saveAllEvents, addEvent, updateEvent, deleteEvent } from './data/eventsData';

const ORGANIZER_ID = 1;

function OrganizerApp() {
  const [allEvents, setAllEvents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    format: [],
    type: [],
  });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

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
    const events = loadAllEvents();
    setAllEvents(events);
  };

  const myEvents = allEvents.filter(event => event.organizerId === ORGANIZER_ID);

  const filteredEvents = myEvents.filter((event) => {
    const matchesSearch = event.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    const matchesFormat =
      filters.format.length === 0 || filters.format.includes(event.format);

    const matchesType =
      filters.type.length === 0 || filters.type.includes(event.type);

    return matchesSearch && matchesFormat && matchesType;
  });

  const handleCreateEvent = (newEventData, imageBase64) => {
    const newEvent = {
      ...newEventData,
      id: Date.now(),
      organizerId: ORGANIZER_ID,
      remainingSeats: newEventData.totalSeats,
      imageUrl: imageBase64 || newEventData.imageUrl || 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&h=500&fit=crop',
    };
    
    const updatedEvents = addEvent(newEvent);
    setAllEvents(updatedEvents);
    setIsCreateModalOpen(false);
  };

  const handleEditEvent = (updatedEventData, imageBase64) => {
    const updatedEvent = {
      ...updatedEventData,
      imageUrl: imageBase64 || updatedEventData.imageUrl,
      remainingSeats: updatedEventData.totalSeats,
    };
    
    const updatedEvents = updateEvent(updatedEvent);
    setAllEvents(updatedEvents);
    setEditingEvent(null);
    setSelectedEvent(null);
  };

  const handleDeleteEvent = (eventId) => {
    if (window.confirm('Вы уверены, что хотите удалить это мероприятие?')) {
      const updatedEvents = deleteEvent(eventId);
      setAllEvents(updatedEvents);
      setSelectedEvent(null);
    }
  };

  const openEditModal = (event) => {
    setEditingEvent(event);
    setSelectedEvent(null);
  };

  return (
    <div className={styles.app}>
      <div className={styles.topPanel}>
        <div className={styles.panelWrapper}>
          <div className={styles.searchWrapper}>
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Поиск моих мероприятий..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className={styles.buttonGroup}>
            <FilterPanel filters={filters} setFilters={setFilters} />
            <button className={styles.createBtn} onClick={() => setIsCreateModalOpen(true)}>
              <i className="fas fa-plus"></i>
              <span>Создать</span>
            </button>
          </div>
        </div>
      </div>

      <div className={styles.container}>
        <div className={styles.counter}>
          Найдено моих мероприятий: {filteredEvents.length}
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
            <EventModalOrganizer 
              event={selectedEvent} 
              onClose={() => setSelectedEvent(null)}
              onEdit={() => openEditModal(selectedEvent)}
              onDelete={() => handleDeleteEvent(selectedEvent.id)}
            />
          </div>
        </div>
      )}

      {(isCreateModalOpen || editingEvent) && (
        <div className={styles.modalOverlay} onClick={() => {
          setIsCreateModalOpen(false);
          setEditingEvent(null);
        }}>
          <div className={styles.modalWrapperLarge} onClick={(e) => e.stopPropagation()}>
            <CreateEventModal
              event={editingEvent}
              onClose={() => {
                setIsCreateModalOpen(false);
                setEditingEvent(null);
              }}
              onSave={editingEvent ? handleEditEvent : handleCreateEvent}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default OrganizerApp;