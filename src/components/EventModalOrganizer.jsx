import React from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? '';

const resolveImageUrl = (raw) => {
  if (!raw) return null;
  if (raw.startsWith('http')) return raw;
  return `${API_URL}${raw}`;
};

const EventModalOrganizer = ({ event, onClose, onEdit, onDelete }) => {
  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return 'Дата не указана';
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) {
      return 'Дата не указана';
    }
    return date.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
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

  const imageUrl = resolveImageUrl(event.image_url || event.imageUrl);

  const styles = {
    modalOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'var(--modal-overlay, rgba(0, 0, 0, 0.5))',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    modal: {
      background: 'var(--bg-modal, white)',
      borderRadius: '28px',
      overflow: 'hidden',
      position: 'relative',
      maxHeight: '85vh',
      display: 'flex',
      flexDirection: 'column',
      width: '90%',
      maxWidth: '500px',
      boxShadow: 'var(--shadow-modal, 0 20px 40px rgba(0, 0, 0, 0.3))',
    },
    closeBtn: {
      position: "absolute",
      top: "12px",
      right: "12px",
      background: "var(--btn-close-bg, rgba(0, 0, 0, 0.6))",
      border: "none",
      color: "var(--btn-close-color, white)",
      width: "36px",
      height: "36px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      zIndex: 10,
      fontSize: "18px",
      fontWeight: "bold",
      transition: "all 0.2s ease",
    },
    modalImage: {
      height: '200px',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundImage: imageUrl ? `url(${imageUrl})` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
      background: 'var(--bg-modal, white)',
    },
    scrollArea: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    },
    description: {
      fontSize: '0.9rem',
      lineHeight: '1.5',
      color: 'var(--text-secondary, #2c3e4e)',
      margin: 0,
    },
    details: {
      background: 'var(--bg-details, #f8fafd)',
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
      color: 'var(--text-secondary, #1f3b4c)',
    },
    detailIcon: {
      width: '20px',
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
    buttonGroup: {
      display: 'flex',
      gap: '12px',
      marginTop: '8px',
    },
    editBtn: {
      flex: 1,
      background: 'var(--btn-primary, linear-gradient(135deg, #2c7ab1, #1e5a7e))',
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
    },
    deleteBtn: {
      flex: 1,
      background: 'var(--btn-danger, linear-gradient(135deg, #e74c3c, #c0392b))',
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
    },
  };

  const getSeatText = () => {
    if (remainingSeats === null) return "∞ (безлимит)";
    if (remainingSeats <= 0) return "Мест нет";
    return `Свободно: ${remainingSeats} из ${totalSeats}`;
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.closeBtn} onClick={onClose}>
          ✕
        </button>

        <div style={styles.modalImage}>
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
                  <strong>Дата и время:</strong> {formatDateTime(event.dateTime)}
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
                  <strong>Количество мест:</strong> {getSeatText()}
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
                  <strong>Тип:</strong> {getTypeEmoji(event.type)} {event.typeLabel}
                </span>
              </div>
            </div>

            <div style={styles.buttonGroup}>
              <button style={styles.editBtn} onClick={onEdit}>
                ✏️ Редактировать
              </button>
              <button style={styles.deleteBtn} onClick={onDelete}>
                🗑️ Удалить
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventModalOrganizer;