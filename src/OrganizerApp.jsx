import React, { useState, useEffect } from "react";
import styles from "./OrganizerApp.module.scss";
import EventCard from "./components/EventCard";
import FilterPanel from "./components/FilterPanel";
import EventModalOrganizer from "./components/EventModalOrganizer";
import CreateEventModal from "./components/CreateEventModal";
import { api } from "./api";

function OrganizerApp() {
  const [events, setEvents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({ format: [], type: [] });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadEvents = () => {
    setLoading(true);
    api.events
      .getMyEvents()
      .then(setEvents)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadEvents();
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

  const handleCreateEvent = async (formData) => {
    try {
      await api.events.create({
        title: formData.title,
        description: formData.description,
        content: formData.location,
        max_slots: formData.totalSeats
          ? parseInt(formData.totalSeats, 10)
          : null,
        cancellation_rules: formData.cancellationRules?.trim() || null,
        date: Math.floor(new Date(formData.dateTime).getTime() / 1000),
        format: formData.format,
        type: formData.type,
      });
      setIsCreateModalOpen(false);
      loadEvents();
    } catch (err) {
      console.error("Failed to create event:", err);
      alert("Ошибка при создании мероприятия");
    }
  };

  const handleEditEvent = async (formData) => {
    try {
      await api.events.update(formData.id, {
        title: formData.title,
        description: formData.description,
        content: formData.location,
        max_slots: formData.totalSeats
          ? parseInt(formData.totalSeats, 10)
          : null,
        cancellation_rules: formData.cancellationRules?.trim() || null,
        date: Math.floor(new Date(formData.dateTime).getTime() / 1000),
        format: formData.format,
        type: formData.type,
      });
      setEditingEvent(null);
      setSelectedEvent(null);
      loadEvents();
    } catch (err) {
      console.error("Failed to update event:", err);
      alert("Ошибка при обновлении мероприятия");
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm("Вы уверены, что хотите удалить это мероприятие?"))
      return;
    try {
      await api.events.delete(eventId);
      setSelectedEvent(null);
      loadEvents();
    } catch (err) {
      console.error("Failed to delete event:", err);
      alert("Ошибка при удалении мероприятия");
    }
  };

  const openEditModal = async (event) => {
    try {
      // Fetch full event to populate all form fields
      const full = await api.events.getById(event.id);
      setEditingEvent({
        ...full,
        location: full.content,
        totalSeats: full.max_slots,
        cancellationRules: full.cancellation_rules ?? "",
        dateTime: new Date(full.date * 1000).toISOString().slice(0, 16),
      });
      setSelectedEvent(null);
    } catch (err) {
      console.error("Failed to load event for editing:", err);
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
              placeholder="Поиск моих мероприятий..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className={styles.buttonGroup}>
            <FilterPanel filters={filters} setFilters={setFilters} />
            <button
              className={styles.createBtn}
              onClick={() => setIsCreateModalOpen(true)}
            >
              <i className="fas fa-plus"></i>
              <span>Создать</span>
            </button>
          </div>
        </div>
      </div>

      <div className={styles.container}>
        {loading && <div className={styles.counter}>Загрузка...</div>}
        {error && <div className={styles.counter}>Ошибка: {error}</div>}
        {!loading && !error && (
          <div className={styles.counter}>
            Найдено моих мероприятий: {filteredEvents.length}
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
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setIsCreateModalOpen(false);
            setEditingEvent(null);
          }}
        >
          <div
            className={styles.modalWrapperLarge}
            onClick={(e) => e.stopPropagation()}
          >
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
