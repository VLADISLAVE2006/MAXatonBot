import React from 'react';

const EventModal = ({ event, onClose }) => {
  const handleRegister = () => {
    // Перенаправление в бот MAX (замените на реальную ссылку)
    window.location.href = 'https://t.me/your_bot_username';
  };

  const styles = {
    modalOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    modal: {
      background: 'white',
      borderRadius: '28px',
      overflow: 'hidden',
      position: 'relative',
      maxHeight: '85vh',
      display: 'flex',
      flexDirection: 'column',
      width: '90%',
      maxWidth: '500px',
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
    },
    closeBtn: {
      position: 'absolute',
      top: '12px',
      right: '12px',
      background: 'rgba(0, 0, 0, 0.6)',
      border: 'none',
      color: 'white',
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      zIndex: 10,
      fontSize: '18px',
      fontWeight: 'bold',
    },
    modalImage: {
      height: '200px',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      position: 'relative',
    },
    imageOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent)',
      padding: '16px',
    },
    modalTitle: {
      color: 'white',
      fontSize: '1.4rem',
      fontWeight: '700',
      margin: 0,
      textShadow: '0 2px 5px rgba(0, 0, 0, 0.3)',
    },
    content: {
      flex: 1,
      overflowY: 'auto',
      padding: '16px 20px 20px 20px',
    },
    scrollArea: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    },
    description: {
      fontSize: '0.9rem',
      lineHeight: '1.5',
      color: '#2c3e4e',
      margin: 0,
    },
    details: {
      background: '#f8fafd',
      borderRadius: '20px',
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
    detailItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontSize: '0.85rem',
      color: '#1f3b4c',
    },
    detailIcon: {
      width: '20px',
      color: '#2c7ab1',
      fontSize: '0.95rem',
    },
    lowSeats: {
      color: '#e67e22',
      fontWeight: 700,
    },
    normalSeats: {
      color: '#27ae60',
      fontWeight: 600,
    },
    registerBtn: {
      background: 'linear-gradient(135deg, #2c7ab1, #1e5a7e)',
      border: 'none',
      color: 'white',
      padding: '12px 20px',
      borderRadius: '50px',
      fontSize: '0.95rem',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      marginTop: '4px',
    },
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.closeBtn} onClick={onClose}>
          ✕
        </button>

        <div
          style={{
            ...styles.modalImage,
            backgroundImage: `url(${event.imageUrl})`
          }}
        >
          <div style={styles.imageOverlay}>
            <h2 style={styles.modalTitle}>{event.title}</h2>
          </div>
        </div>

        <div style={styles.content}>
          <div style={styles.scrollArea}>
            <p style={styles.description}>{event.description}</p>

            <div style={styles.details}>
              <div style={styles.detailItem}>
                <span style={styles.detailIcon}>📅</span>
                <span>
                  <strong>Дата и время:</strong> {event.dateTime}
                </span>
              </div>

              <div style={styles.detailItem}>
                <span style={styles.detailIcon}>📍</span>
                <span>
                  <strong>Место проведения:</strong> {event.location}
                </span>
              </div>

              <div style={styles.detailItem}>
                <span style={styles.detailIcon}>👥</span>
                <span>
                  <strong>Всего мест:</strong> {event.totalSeats}
                </span>
              </div>

              <div style={styles.detailItem}>
                <span style={styles.detailIcon}>💺</span>
                <span>
                  <strong>Осталось мест:</strong>{' '}
                  <span style={event.remainingSeats <= 5 ? styles.lowSeats : styles.normalSeats}>
                    {event.remainingSeats}
                  </span>
                </span>
              </div>

              <div style={styles.detailItem}>
                <span style={styles.detailIcon}>🌐</span>
                <span>
                  <strong>Формат:</strong>{' '}
                  {event.format === 'online' ? '🖥 Онлайн' : '🏢 Оффлайн'}
                </span>
              </div>

              <div style={styles.detailItem}>
                <span style={styles.detailIcon}>🏷️</span>
                <span>
                  <strong>Тип:</strong> {event.typeLabel}
                </span>
              </div>
            </div>

            <button style={styles.registerBtn} onClick={handleRegister}>
              ✏️ Записаться на мероприятие
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventModal;