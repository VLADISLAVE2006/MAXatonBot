import { useState, useRef, useEffect } from 'react';

const CreateEventModal = ({ event, onClose, onSave }) => {
  const isEditing = !!event;

  const [formData, setFormData] = useState({
    title: event?.title || '',
    description: event?.description || '',
    dateTime: event?.dateTime || '',
    location: event?.location || '',
    totalSeats: event?.totalSeats || '',
    cancellationRules: event?.cancellationRules || '',
    format: event?.format || 'offline',
    type: event?.type || 'hackathon',
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(event?.imageUrl || '');
  const [hasChanges, setHasChanges] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const hasUnsavedChanges = () => {
      const originalData = {
        title: event?.title || '',
        description: event?.description || '',
        dateTime: event?.dateTime || '',
        location: event?.location || '',
        totalSeats: event?.totalSeats || '',
        format: event?.format || 'offline',
        type: event?.type || 'hackathon',
      };

      const currentData = {
        title: formData.title,
        description: formData.description,
        dateTime: formData.dateTime,
        location: formData.location,
        totalSeats: formData.totalSeats,
        format: formData.format,
        type: formData.type,
      };

      const isDataChanged = JSON.stringify(originalData) !== JSON.stringify(currentData);
      const isImageChanged = (imageFile !== null) ||
        (imagePreview && !event?.imageUrl) ||
        (event?.imageUrl && imagePreview !== event?.imageUrl && imageFile);

      return isDataChanged || isImageChanged;
    };

    setHasChanges(hasUnsavedChanges());
  }, [formData, imageFile, imagePreview, event]);

  const handleClose = () => {
    if (hasChanges) {
      const confirmClose = window.confirm('У вас есть несохранённые изменения. Вы уверены, что хотите закрыть?');
      if (confirmClose) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = 'У вас есть несохранённые изменения. Вы уверены, что хотите покинуть страницу?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  const typeOptions = [
    { value: 'hackathon', label: '🚀 Хакатон' },
    { value: 'olympiad', label: '🏆 Олимпиада' },
    { value: 'conference', label: '🎤 Конференция' },
    { value: 'openday', label: '🚪 День открытых дверей' },
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 500 * 1024) {
        alert('Изображение слишком большое. Максимальный размер 500KB');
        return;
      }

      if (!file.type.match('image.*')) {
        alert('Пожалуйста, выберите изображение');
        return;
      }

      setImageFile(file);

      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      alert('Введите название мероприятия');
      return;
    }
    if (!formData.description.trim()) {
      alert('Введите описание');
      return;
    }
    if (!formData.dateTime) {
      alert('Выберите дату и время');
      return;
    }
    if (!formData.location.trim()) {
      alert('Введите место проведения');
      return;
    }
    if (!formData.totalSeats || formData.totalSeats <= 0) {
      alert('Введите корректное количество мест');
      return;
    }

    const saveData = {
      ...formData,
      totalSeats: parseInt(formData.totalSeats, 10),
      id: event?.id,
    };

    onSave(saveData, imageFile);
  };

  const formatDateForInput = (dateTimeStr) => {
    if (!dateTimeStr) return '';
    return dateTimeStr.slice(0, 16);
  };

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
      width: '90%',
      maxWidth: '550px',
      maxHeight: '90vh',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: 'var(--shadow-modal, 0 20px 40px rgba(0, 0, 0, 0.3))',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '18px 24px',
      borderBottom: '1px solid var(--border-light, #eef2f6)',
    },
    title: {
      fontSize: '1.3rem',
      fontWeight: 700,
      color: 'var(--text-primary, #1a3d5c)',
      margin: 0,
    },
    closeBtn: {
      background: "var(--btn-close-bg, #f0f4fa)",
      border: "none",
      width: "34px",
      height: "34px",
      borderRadius: "50%",
      cursor: "pointer",
      fontSize: "16px",
      color: "var(--btn-close-color, #2c6e9e)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.2s ease",
    },
    body: {
      flex: 1,
      overflowY: 'auto',
      padding: '20px 24px',
    },
    formGroup: {
      marginBottom: '18px',
    },
    label: {
      display: 'block',
      fontWeight: 600,
      color: 'var(--chip-active, #2c6e9e)',
      marginBottom: '8px',
      fontSize: '14px',
    },
    input: {
      width: '100%',
      padding: '10px 14px',
      border: '1px solid var(--border-input, #d4e2f0)',
      borderRadius: '12px',
      fontSize: '14px',
      outline: 'none',
      transition: 'border-color 0.2s',
      boxSizing: 'border-box',
      background: 'var(--bg-input, white)',
      color: 'var(--text-primary, #1a3d5c)',
    },
    textarea: {
      width: '100%',
      padding: '10px 14px',
      border: '1px solid var(--border-input, #d4e2f0)',
      borderRadius: '12px',
      fontSize: '14px',
      outline: 'none',
      resize: 'vertical',
      minHeight: '80px',
      fontFamily: 'inherit',
      boxSizing: 'border-box',
      background: 'var(--bg-input, white)',
      color: 'var(--text-primary, #1a3d5c)',
    },
    select: {
      width: '100%',
      padding: '10px 14px',
      border: '1px solid var(--border-input, #d4e2f0)',
      borderRadius: '12px',
      fontSize: '14px',
      outline: 'none',
      backgroundColor: 'var(--bg-input, white)',
      color: 'var(--text-primary, #1a3d5c)',
      cursor: 'pointer',
    },
    imageArea: {
      border: '2px dashed var(--border-input, #d4e2f0)',
      borderRadius: '16px',
      padding: '16px',
      textAlign: 'center',
      cursor: 'pointer',
      transition: 'border-color 0.2s',
    },
    imagePreview: {
      maxWidth: '100%',
      maxHeight: '150px',
      borderRadius: '12px',
      marginTop: '12px',
    },
    footer: {
      display: 'flex',
      gap: '12px',
      padding: '16px 24px 24px',
      borderTop: '1px solid var(--border-light, #eef2f6)',
    },
    cancelBtn: {
      flex: 1,
      background: 'var(--btn-secondary, #f0f4fa)',
      border: 'none',
      padding: '12px',
      borderRadius: '40px',
      cursor: 'pointer',
      fontWeight: 500,
      color: 'var(--btn-secondary-text, #4a6f8f)',
      fontSize: '14px',
    },
    saveBtn: {
      flex: 1,
      background: '#2c7ab1',
      border: 'none',
      padding: '12px',
      borderRadius: '40px',
      cursor: 'pointer',
      fontWeight: 600,
      color: 'white',
      fontSize: '14px',
    },
    row: {
      display: 'flex',
      gap: '12px',
    },
    half: {
      flex: 1,
    },
  };

  return (
    <div style={styles.modalOverlay} onClick={handleClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>{isEditing ? 'Редактировать мероприятие' : 'Создать мероприятие'}</h2>
          <button style={styles.closeBtn} onClick={handleClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.body}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Загрузите изображение</label>
            <div style={styles.imageArea} onClick={() => fileInputRef.current?.click()}>
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" style={styles.imagePreview} />
              ) : (
                <div style={{ color: 'var(--text-placeholder, #7a9bc2)' }}>
                  <i className="fas fa-cloud-upload-alt" style={{ fontSize: '32px', marginBottom: '8px', display: 'block' }}></i>
                  <span>Нажмите для выбора изображения</span>
                  <br />
                  <small style={{ fontSize: '11px' }}>JPEG, PNG, WebP до 500KB</small>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Название мероприятия *</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Введите название"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Описание *</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Опишите мероприятие"
              style={styles.textarea}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Дата и время *</label>
            <input
              type="datetime-local"
              name="dateTime"
              value={formatDateForInput(formData.dateTime)}
              onChange={handleChange}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Место проведения *</label>
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="Адрес или ссылка на онлайн-трансляцию"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Всего мест *</label>
            <input
              type="number"
              name="totalSeats"
              value={formData.totalSeats}
              onChange={handleChange}
              placeholder="Количество мест"
              min="1"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Правила отмены</label>
            <textarea
              name="cancellationRules"
              value={formData.cancellationRules}
              onChange={handleChange}
              placeholder="Условия отмены записи"
              style={styles.textarea}
            />
          </div>

          <div style={styles.row}>
            <div style={styles.half}>
              <label style={styles.label}>Формат *</label>
              <select
                name="format"
                value={formData.format}
                onChange={handleChange}
                style={styles.select}
              >
                <option value="offline">🏢 Оффлайн</option>
                <option value="online">🖥 Онлайн</option>
              </select>
            </div>

            <div style={styles.half}>
              <label style={styles.label}>Тип мероприятия *</label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                style={styles.select}
              >
                {typeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </form>

        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={handleClose}>Отмена</button>
          <button style={styles.saveBtn} onClick={handleSubmit}>
            {isEditing ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateEventModal;