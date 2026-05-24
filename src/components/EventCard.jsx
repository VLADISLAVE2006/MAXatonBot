import React from 'react';
import styles from './EventCard.module.scss';

const EventCard = ({ event, onClick }) => {
  const freeSlots = event.max_slots != null ? event.max_slots - event.registered_count : null;

  return (
    <div className={styles.card} onClick={onClick}>
      <div
        className={styles.imageWrapper}
        style={{ backgroundImage: `url(${event.imageUrl})` }}
      >
        {freeSlots != null && (
          <div className={`${styles.slotsBadge} ${freeSlots === 0 ? styles.full : freeSlots <= 5 ? styles.low : ''}`}>
            {freeSlots === 0 ? 'Мест нет' : `Свободно: ${freeSlots} из ${event.max_slots}`}
          </div>
        )}
        <div className={styles.overlay}>
          <h3 className={styles.title}>{event.title}</h3>
        </div>
      </div>
    </div>
  );
};

export default EventCard;