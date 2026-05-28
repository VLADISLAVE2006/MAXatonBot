const baseEvents = [
  {
    id: 1,
    organizerId: 0,
    title: 'Хакатон "Техностарт 2025"',
    imageUrl: 'https://images.unsplash.com/photo-1504384764586-bb4cdc1707b0?w=800&h=500&fit=crop',
    description: 'Соревнование для разработчиков и дизайнеров. Создайте инновационный проект за 48 часов!',
    dateTime: '2025-05-15T10:00',
    location: 'МИРЭА, Технопарк, зал "Инновация"',
    totalSeats: 120,
    remainingSeats: 34,
    format: 'offline',
    type: 'hackathon',
    typeLabel: 'Хакатон',
  },
  {
    id: 2,
    organizerId: 0,
    title: 'Олимпиада по программированию',
    imageUrl: 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=800&h=500&fit=crop',
    description: 'Ежегодная студенческая олимпиада по алгоритмам и структурам данных.',
    dateTime: '2025-05-22T11:00',
    location: 'Онлайн (платформа Zoom)',
    totalSeats: 300,
    remainingSeats: 112,
    format: 'online',
    type: 'olympiad',
    typeLabel: 'Олимпиада',
  },
  {
    id: 3,
    organizerId: 0,
    title: 'IT-конференция "Будущее технологий"',
    imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=500&fit=crop',
    description: 'Ведущие эксперты рынка обсудят тренды в AI, Cloud и кибербезопасности.',
    dateTime: '2025-06-05T09:30',
    location: 'МИРЭА, Конгресс-центр',
    totalSeats: 250,
    remainingSeats: 78,
    format: 'offline',
    type: 'conference',
    typeLabel: 'Конференция',
  },
  {
    id: 4,
    organizerId: 0,
    title: 'День открытых дверей ИИ',
    imageUrl: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&h=500&fit=crop',
    description: 'Знакомство с программами бакалавриата и магистратуры в сфере ИИ.',
    dateTime: '2025-06-10T14:00',
    location: 'Онлайн (YouTube-трансляция)',
    totalSeats: 500,
    remainingSeats: 340,
    format: 'online',
    type: 'openday',
    typeLabel: 'День открытых дверей',
  },
  {
    id: 5,
    organizerId: 0,
    title: 'Олимпиада по кибербезопасности',
    imageUrl: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&h=500&fit=crop',
    description: 'CTF-соревнование для студентов. Лучшие получат призы и стажировки.',
    dateTime: '2025-06-18T10:00',
    location: 'МИРЭА, Лаборатория кибербезопасности',
    totalSeats: 80,
    remainingSeats: 22,
    format: 'offline',
    type: 'olympiad',
    typeLabel: 'Олимпиада',
  },
];

const STORAGE_KEY = 'all_events';

export const loadAllEvents = () => {
  const savedEvents = localStorage.getItem(STORAGE_KEY);
  if (savedEvents) {
    return JSON.parse(savedEvents);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(baseEvents));
  return [...baseEvents];
};

export const saveAllEvents = (events) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
};

export const addEvent = (newEvent) => {
  const events = loadAllEvents();
  events.push(newEvent);
  saveAllEvents(events);
  return events;
};

export const updateEvent = (updatedEvent) => {
  const events = loadAllEvents();
  const index = events.findIndex(e => e.id === updatedEvent.id);
  if (index !== -1) {
    events[index] = updatedEvent;
    saveAllEvents(events);
  }
  return events;
};

export const deleteEvent = (eventId) => {
  const events = loadAllEvents();
  const filtered = events.filter(e => e.id !== eventId);
  saveAllEvents(filtered);
  return filtered;
};

export const events = loadAllEvents();