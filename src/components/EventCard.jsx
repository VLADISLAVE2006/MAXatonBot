import React from 'react';
import styles from './EventCard.module.scss';

const EventCard = ({ event, onClick }) => {
  const formatDate = (dateTimeStr) => {
    if (!dateTimeStr) return 'Дата не указана';
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) {
      return 'Дата не указана';
    }
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTypeEmoji = (type) => {
    const types = {
      hackathon: '🚀',
      olympiad: '🏆',
      conference: '🎤',
      openday: '🚪'
    };
    return types[type] || '📌';
  };

  const totalSeats = event.totalSeats || event.max_slots;
  const remainingSeats = event.remainingSeats !== undefined ? event.remainingSeats : 
                         (event.max_slots && event.registered_count !== undefined ? event.max_slots - event.registered_count : null);
  
  const freeSlots = remainingSeats;

  return (
    <div className={styles.card} onClick={onClick}>
      <div
        className={styles.imageWrapper}
        style={{ backgroundImage: `url(${event.imageUrl})` }}
      >
        {freeSlots != null && (
          <div className={`${styles.slotsBadge} ${freeSlots === 0 ? styles.full : freeSlots <= 5 ? styles.low : ''}`}>
            {freeSlots === 0 ? 'Мест нет' : `Свободно: ${freeSlots} из ${totalSeats}`}
          </div>
        )}
        <div className={styles.overlay}>
          <h3 className={styles.title}>{event.title}</h3>
          <div className={styles.eventInfo}>
            <span className={styles.date}>
              📅 {formatDate(event.dateTime)}
            </span>
            <span className={styles.type}>
              {getTypeEmoji(event.type)} {event.typeLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventCard;