import React from 'react';
import styles from './EventCard.module.scss';

const EventCard = ({ event, onClick }) => {
  return (
    <div className={styles.card} onClick={onClick}>
      <div
        className={styles.imageWrapper}
        style={{ backgroundImage: `url(${event.imageUrl})` }}
      >
        <div className={styles.overlay}>
          <h3 className={styles.title}>{event.title}</h3>
        </div>
      </div>
    </div>
  );
};

export default EventCard;