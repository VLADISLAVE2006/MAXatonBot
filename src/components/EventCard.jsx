import React from 'react';
import styles from './EventCard.module.scss';

const API_URL = import.meta.env.VITE_API_URL ?? '';

const resolveImageUrl = (raw) => {
  if (!raw) return null;
  if (raw.startsWith('http')) return raw;
  return `${API_URL}${raw}`;
};

const EventCard = ({ event, onClick }) => {
  const formatDate = (value) => {
    if (!value) return 'Дата не указана';
    const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
    if (isNaN(date.getTime())) return 'Дата не указана';
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Поддержка обоих форматов (max_slots/registered_count и totalSeats/remainingSeats)
  const totalSeats = event.totalSeats || event.max_slots;
  const remainingSeats = event.remainingSeats !== undefined ? event.remainingSeats :
                         (event.max_slots && event.registered_count !== undefined ? event.max_slots - event.registered_count : null);

  const freeSlots = remainingSeats;

  const imageUrl = resolveImageUrl(event.image_url || event.imageUrl);
  const formattedDate = formatDate(event.dateTime || event.date);

  return (
    <div className={styles.card} onClick={onClick}>
      <div
        className={`${styles.imageWrapper} ${!imageUrl ? styles.noImage : ''}`}
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
      >
        {freeSlots != null && (
          <div className={`${styles.slotsBadge} ${freeSlots === 0 ? styles.full : freeSlots <= 5 ? styles.low : ''}`}>
            {freeSlots === 0 ? 'Мест нет' : `Свободно: ${freeSlots}`}
          </div>
        )}
        <div className={styles.overlay}>
          <h3 className={styles.title}>{event.title}</h3>
          <div className={styles.eventInfo}>
            <span className={styles.date}>
              {formattedDate}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventCard;