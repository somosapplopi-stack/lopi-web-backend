export type Category = { slug: string; name: string; image: string; emoji: string };

export const CATEGORIES: Category[] = [
  { slug: 'deportes', name: 'Deportes', image: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400', emoji: '⚽' },
  { slug: 'entretenimiento', name: 'Entretenimiento', image: 'https://images.unsplash.com/photo-1489599735165-30f4c48d13a3?w=400', emoji: '🎬' },
  { slug: 'aire-libre', name: 'Aire libre', image: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=400', emoji: '🏕️' },
  { slug: 'cultura', name: 'Cultura', image: 'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=400', emoji: '🎭' },
  { slug: 'gastronomia', name: 'Gastronomía', image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400', emoji: '🍝' },
  { slug: 'fiestas', name: 'Fiestas', image: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400', emoji: '🎉' },
  { slug: 'viajes', name: 'Viajes', image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400', emoji: '✈️' },
  { slug: 'mascotas', name: 'Mascotas', image: 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=400', emoji: '🐶' },
  { slug: 'co-working', name: 'Co-Working', image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400', emoji: '💻' },
  { slug: 'espiritualidad', name: 'Espiritualidad', image: 'https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?w=400', emoji: '🧘' },
  { slug: 'citas', name: 'Citas', image: 'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=400', emoji: '💘' },
  { slug: 'educacion', name: 'Educación', image: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=400', emoji: '📚' },
  { slug: 'compras', name: 'Compras', image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400', emoji: '🛍️' },
  { slug: 'videojuegos', name: 'Videojuegos', image: 'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=400', emoji: '🎮' },
  { slug: 'festividades', name: 'Festividades', image: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400', emoji: '🎊' },
];

export const CATEGORY_MAP: Record<string, Category> = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c]));

export const CITIES = ['Bucaramanga', 'Bogotá', 'Medellín', 'Barranquilla', 'Cartagena', 'Cúcuta'];
