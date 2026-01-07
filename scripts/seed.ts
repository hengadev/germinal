import { db } from '../src/lib/server/db/index.js';
import { events, talents } from '../src/lib/server/db/schema.js';

async function seed() {
  console.log('🌱 Seeding database with mock data...');

  try {
    // Clear existing data
    await db.delete(events);
    await db.delete(talents);

    // Create sample events
    console.log('  Creating events...');
    await db.insert(events).values([
      {
        title: 'Summer Music Festival 2026',
        slug: 'summer-music-festival-2026',
        description: 'Join us for an unforgettable night of live music featuring local and international artists. Experience a magical evening under the stars with food trucks, craft beer, and amazing vibes.',
        startDate: new Date('2026-07-15T18:00:00Z'),
        endDate: new Date('2026-07-15T23:00:00Z'),
        location: 'Central Park, New York',
        published: true,
      },
      {
        title: 'Tech Innovation Summit',
        slug: 'tech-innovation-summit',
        description: 'Explore the latest in technology and innovation with industry leaders. Network with fellow tech enthusiasts and learn about cutting-edge developments in AI, blockchain, and more.',
        startDate: new Date('2026-09-20T09:00:00Z'),
        endDate: new Date('2026-09-22T17:00:00Z'),
        location: 'San Francisco Convention Center',
        published: true,
      },
      {
        title: 'Art & Design Exhibition',
        slug: 'art-design-exhibition',
        description: 'A curated collection of contemporary art and design from emerging artists. Discover unique pieces and meet the creators behind stunning visual works.',
        startDate: new Date('2026-10-10T10:00:00Z'),
        endDate: new Date('2026-10-31T18:00:00Z'),
        location: 'Modern Art Gallery, London',
        published: true,
      },
      {
        title: 'Food & Wine Tasting Festival',
        slug: 'food-wine-tasting-festival',
        description: 'Indulge in a culinary journey featuring award-winning chefs and premium wines. Sample exquisite dishes and discover new flavors from around the world.',
        startDate: new Date('2026-08-05T12:00:00Z'),
        endDate: new Date('2026-08-07T20:00:00Z'),
        location: 'Napa Valley, California',
        published: true,
      },
      {
        title: 'Marathon for Charity',
        slug: 'marathon-for-charity',
        description: 'Run for a cause! Join thousands of runners in this annual charity marathon supporting children\'s education worldwide.',
        startDate: new Date('2026-11-15T06:00:00Z'),
        endDate: new Date('2026-11-15T14:00:00Z'),
        location: 'Boston, Massachusetts',
        published: true,
      },
    ]);

    // Create sample talents
    console.log('  Creating talents...');
    await db.insert(talents).values([
      {
        firstName: 'Sarah',
        lastName: 'Johnson',
        role: 'Lead Vocalist & Songwriter',
        bio: 'Award-winning vocalist with 10+ years of experience in jazz and soul music. Has performed at major festivals worldwide and released three critically acclaimed albums.',
        city: 'Nashville',
        country: 'USA',
        quote: 'Music is the language of the soul, transcending all boundaries.',
        specializations: JSON.stringify([
          'Vocal Performance',
          'Songwriting',
          'Music Production'
        ]),
        socialLinks: JSON.stringify({
          instagram: 'https://instagram.com/sarahjohnson',
          twitter: 'https://twitter.com/sarahjohnson',
        }),
        published: true,
      },
      {
        firstName: 'Michael',
        lastName: 'Chen',
        role: 'Tech Entrepreneur & Speaker',
        bio: 'Serial entrepreneur and technology innovator. Founded multiple successful startups in the AI and fintech space. Regular speaker at major tech conferences.',
        city: 'San Francisco',
        country: 'USA',
        quote: 'Innovation happens at the intersection of technology and humanity.',
        specializations: JSON.stringify([
          'Artificial Intelligence',
          'Product Strategy',
          'Public Speaking'
        ]),
        socialLinks: JSON.stringify({
          linkedin: 'https://linkedin.com/in/michaelchen',
          twitter: 'https://twitter.com/michaelchen',
        }),
        published: true,
      },
      {
        firstName: 'Emma',
        lastName: 'Rodriguez',
        role: 'Contemporary Artist',
        bio: 'Contemporary visual artist specializing in mixed media and installations. Her work has been featured in galleries across Europe and North America.',
        city: 'Barcelona',
        country: 'Spain',
        quote: 'Art is not what you see, but what you make others see.',
        specializations: JSON.stringify([
          'Mixed Media',
          'Installation Art',
          'Digital Sculpture'
        ]),
        socialLinks: JSON.stringify({
          instagram: 'https://instagram.com/emmarodriguez',
          website: 'https://emmarodriguez.art',
        }),
        published: true,
      },
      {
        firstName: 'David',
        lastName: 'Thompson',
        role: 'Celebrity Chef',
        bio: 'Michelin-starred chef and culinary innovator. Known for his farm-to-table approach and sustainable cooking practices. Author of three bestselling cookbooks.',
        city: 'London',
        country: 'UK',
        quote: 'Cooking is about creating experiences, not just meals.',
        specializations: JSON.stringify([
          'French Cuisine',
          'Pastry Arts',
          'Restaurant Management'
        ]),
        socialLinks: JSON.stringify({
          instagram: 'https://instagram.com/chefthompson',
          website: 'https://davidthompson.com',
        }),
        published: true,
      },
      {
        firstName: 'Lisa',
        lastName: 'Martinez',
        role: 'Professional Marathon Runner',
        bio: 'Olympic athlete and marathon champion. Holds multiple national records and actively promotes youth sports programs and fitness education.',
        city: 'Nairobi',
        country: 'Kenya',
        quote: 'Every mile is a meditation, every race is a journey.',
        specializations: JSON.stringify([
          'Long Distance Running',
          'Sports Nutrition',
          'Athletic Coaching'
        ]),
        socialLinks: JSON.stringify({
          instagram: 'https://instagram.com/lisamartinez',
          twitter: 'https://twitter.com/lisamartinez',
        }),
        published: true,
      },
    ]);

    console.log('✅ Database seeded successfully!');
    console.log('   - 5 events created');
    console.log('   - 5 talents created');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }

  process.exit(0);
}

seed().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
