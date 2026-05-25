import React from 'react';
import styles from './EventCard.module.scss';

const EventCard = ({ event, onClick }) => {
  // Форматирование даты для отображения на карточке
  const formatDate = (dateTimeStr) => {
    if (!dateTimeStr) return 'Дата не указана';
    
    // Пробуем распарсить дату
    const date = new Date(dateTimeStr);
    
    // Проверяем, корректная ли дата
    if (isNaN(date.getTime())) {
      console.warn('Invalid date:', dateTimeStr);
      return 'Дата не указана';
    }
    
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Поддержка обоих форматов (max_slots/registered_count и totalSeats/remainingSeats)
  const totalSeats = event.totalSeats || event.max_slots;
  const remainingSeats = event.remainingSeats !== undefined ? event.remainingSeats : 
                         (event.max_slots && event.registered_count !== undefined ? event.max_slots - event.registered_count : null);
  
  const freeSlots = remainingSeats;

  // Получаем отформатированную дату
  const formattedDate = formatDate(event.dateTime);

  return (
    <div className={styles.card} onClick={onClick}>
      <div
        className={styles.imageWrapper}
        style={{ backgroundImage: `url(${event.imageUrl})` }}
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