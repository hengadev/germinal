// Mock data for local development - no database required!

export const MOCK_EVENTS = [
    {
        id: '1',
        title: 'Summer Music Festival 2026',
        slug: 'summer-music-festival-2026',
        description: 'Join us for an unforgettable night of live music featuring local and international artists. Experience a magical evening under the stars with food trucks, craft beer, and amazing vibes.',
        startDate: new Date('2026-07-15T18:00:00Z'),
        endDate: new Date('2026-07-15T23:00:00Z'),
        location: 'Central Park, New York',
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        coverMediaId: null,
        coverMedia: {
            type: "image",
            url: "https://hoirqrkdgbmvpwutwuwj.supabase.co/storage/v1/object/public/assets/assets/917d6f93-fb36-439a-8c48-884b67b35381_1600w.jpg",
        },
        media: [],
    },
    {
        id: '2',
        title: 'Tech Innovation Summit',
        slug: 'tech-innovation-summit',
        description: 'Explore the latest in technology and innovation with industry leaders. Network with fellow tech enthusiasts and learn about cutting-edge developments in AI, blockchain, and more.',
        startDate: new Date('2026-09-20T09:00:00Z'),
        endDate: new Date('2026-09-22T17:00:00Z'),
        location: 'San Francisco Convention Center',
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        coverMediaId: null,
        coverMedia: {
            type: "image",
            url: "https://images.unsplash.com/photo-1470723710355-95304d8aece4?q=80&amp;w=2670&amp;auto=format&amp;fit=crop",
        },
        media: [],
    },
    {
        id: '3',
        title: 'Art & Design Exhibition',
        slug: 'art-design-exhibition',
        description: 'A curated collection of contemporary art and design from emerging artists. Discover unique pieces and meet the creators behind stunning visual works.',
        startDate: new Date('2026-10-10T10:00:00Z'),
        endDate: new Date('2026-10-31T18:00:00Z'),
        location: 'Modern Art Gallery, London',
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        coverMediaId: null,
        coverMedia: {
            type: "image",
            url: "https://images.unsplash.com/photo-1470723710355-95304d8aece4?q=80&amp;w=2670&amp;auto=format&amp;fit=crop",
        },
        media: [],
    },
    {
        id: '4',
        title: 'Food & Wine Tasting Festival',
        slug: 'food-wine-tasting-festival',
        description: 'Indulge in a culinary journey featuring award-winning chefs and premium wines. Sample exquisite dishes and discover new flavors from around the world.',
        startDate: new Date('2026-08-05T12:00:00Z'),
        endDate: new Date('2026-08-07T20:00:00Z'),
        location: 'Napa Valley, California',
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        coverMediaId: null,
        coverMedia: null,
        media: [],
    },
    {
        id: '5',
        title: 'Marathon for Charity',
        slug: 'marathon-for-charity',
        description: 'Run for a cause! Join thousands of runners in this annual charity marathon supporting children\'s education worldwide.',
        startDate: new Date('2026-11-15T06:00:00Z'),
        endDate: new Date('2026-11-15T14:00:00Z'),
        location: 'Boston, Massachusetts',
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        coverMediaId: null,
        coverMedia: null,
        media: [],
    },
];

export const MOCK_TALENTS = [
    {
        id: '1',
        firstName: 'Sarah',
        lastName: 'Johnson',
        role: 'Lead Vocalist & Songwriter',
        bio: 'Award-winning vocalist with 10+ years of experience in jazz and soul music. Has performed at major festivals worldwide and released three critically acclaimed albums.',
        socialLinks: JSON.stringify({
            instagram: 'https://instagram.com/sarahjohnson',
            twitter: 'https://twitter.com/sarahjohnson',
        }),
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        profileMediaId: null,
        profileMedia: {
            url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=2564&auto=format&fit=crop",
        },
        media: [],
    },
    {
        id: '2',
        firstName: 'Michael',
        lastName: 'Chen',
        role: 'Tech Entrepreneur & Speaker',
        bio: 'Serial entrepreneur and technology innovator. Founded multiple successful startups in the AI and fintech space. Regular speaker at major tech conferences.',
        socialLinks: JSON.stringify({
            linkedin: 'https://linkedin.com/in/michaelchen',
            twitter: 'https://twitter.com/michaelchen',
        }),
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        profileMediaId: null,
        profileMedia: {
            url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&amp;w=2574&amp;auto=format&amp;fit=crop",
        },

        media: [],
    },
    {
        id: '3',
        firstName: 'Emma',
        lastName: 'Rodriguez',
        role: 'Contemporary Artist',
        bio: 'Contemporary visual artist specializing in mixed media and installations. Her work has been featured in galleries across Europe and North America.',
        socialLinks: JSON.stringify({
            instagram: 'https://instagram.com/emmarodriguez',
            website: 'https://emmarodriguez.art',
        }),
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        profileMediaId: null,
        profileMedia: {
            url: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?q=80&amp;w=2574&amp;auto=format&amp;fit=crop",
        },
        media: [],
    },
    {
        id: '4',
        firstName: 'David',
        lastName: 'Thompson',
        role: 'Celebrity Chef',
        bio: 'Michelin-starred chef and culinary innovator. Known for his farm-to-table approach and sustainable cooking practices. Author of three bestselling cookbooks.',
        socialLinks: JSON.stringify({
            instagram: 'https://instagram.com/chefthompson',
            website: 'https://davidthompson.com',
        }),
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        profileMediaId: null,
        profileMedia: null,
        media: [],
    },
    {
        id: '5',
        firstName: 'Lisa',
        lastName: 'Martinez',
        role: 'Professional Marathon Runner',
        bio: 'Olympic athlete and marathon champion. Holds multiple national records and actively promotes youth sports programs and fitness education.',
        socialLinks: JSON.stringify({
            instagram: 'https://instagram.com/lisamartinez',
            twitter: 'https://twitter.com/lisamartinez',
        }),
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        profileMediaId: null,
        profileMedia: null,
        media: [],
    },
];

// Helper to check if we should use mock data
// Mock data is used when:
// 1. USE_MOCK_DATA is explicitly set to 'true', OR
// 2. No DATABASE_URL is provided (app can run without database!)
export const USE_MOCK_DATA = process.env.USE_MOCK_DATA === 'true' || !process.env.DATABASE_URL;

if (USE_MOCK_DATA) {
    console.log('📦 Mock data mode enabled - no database needed!');
    console.log('   To use real database, set DATABASE_URL in .env');
}
