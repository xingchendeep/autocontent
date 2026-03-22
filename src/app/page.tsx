import Hero from '@/components/layout/Hero';
import HomePageClient from '@/components/home/HomePageClient';

export default function HomePage() {
  return <HomePageClient hero={<Hero />} />;
}
