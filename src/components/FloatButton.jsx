import React from 'react';
import styles from './FloatButton.module.scss';

const FloatButton = () => {
  const handleContact = () => {
    window.location.href = 'https://t.me/your_bot_username'; // Замените на ссылку бота
  };

  return (
    <button className={styles.floatBtn} onClick={handleContact}>
      <i className="fas fa-comment-dots"></i>
      <span>Связаться с нами</span>
    </button>
  );
};

export default FloatButton;