// Mock data for local development - no database required!

// Helper to create a mock media object
function createMockMedia(url: string, type: 'image' | 'video' = 'image') {
    return {
        id: `mock-media-${Math.random().toString(36).substr(2, 9)}`,
        type,
        url,
        s3Key: `mock/${url.split('/').pop()}`,
        mimeType: type === 'image' ? 'image/jpeg' : 'video/mp4',
        size: 1234567,
        eventId: null as string | null,
        talentId: null as string | null,
        isCover: false,
        createdAt: new Date()
    };
}

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
        coverMediaId: 'mock-cover-1',
        coverMedia: createMockMedia("https://hoirqrkdgbmvpwutwuwj.supabase.co/storage/v1/object/public/assets/assets/917d6f93-fb36-439a-8c48-884b67b35381_1600w.jpg"),
        media: [
            createMockMedia("https://hoirqrkdgbmvpwutwuwj.supabase.co/storage/v1/object/public/assets/assets/917d6f93-fb36-439a-8c48-884b67b35381_1600w.jpg"),
            createMockMedia("https://images.unsplash.com/photo-1470723710355-95304d8aece4?q=80&w=2670&auto=format&fit=crop"),
            createMockMedia("https://images.unsplash.com/photo-1544531586-fde5298cdd40?q=80&w=2670&auto=format&fit=crop"),
            createMockMedia("https://images.unsplash.com/photo-1600607686527-6fb886090705?q=80&w=2500&auto=format&fit=crop"),
            createMockMedia("https://images.unsplash.com/photo-1519750783826-e2420f4d687f?q=80&w=2574&auto=format&fit=crop"),
            createMockMedia("https://images.unsplash.com/photo-1554907984-15263bfd63bd?q=80&w=2670&auto=format&fit=crop"),
        ],
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
        coverMedia: createMockMedia("https://images.unsplash.com/photo-1470723710355-95304d8aece4?q=80&w=2670&auto=format&fit=crop"),
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
        coverMedia: createMockMedia("https://images.unsplash.com/photo-1544531586-fde5298cdd40?q=80&w=2670&auto=format&fit=crop"),
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
        coverMedia: createMockMedia("https://images.unsplash.com/photo-1600607686527-6fb886090705?q=80&w=2500&auto=format&fit=crop"),
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
        coverMedia: createMockMedia("https://images.unsplash.com/photo-1519750783826-e2420f4d687f?q=80&w=2574&auto=format&fit=crop"),
        media: [],
    },
    {
        id: '6',
        title: 'Abstract Thought',
        slug: 'abstract-thought',
        description: 'Lecture series on contemporary philosophy.',
        startDate: new Date('2026-11-15T06:00:00Z'),
        endDate: new Date('2026-11-15T14:00:00Z'),
        location: 'London',
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        coverMediaId: null,
        coverMedia: createMockMedia("https://images.unsplash.com/photo-1554907984-15263bfd63bd?q=80&w=2670&auto=format&fit=crop"),
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
            website: 'https://sarah.johnson.com',
            email: 'sarah.johnson@email.com',
        }),
        published: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        profileMediaId: 'mock-profile-1',
        profileMedia: createMockMedia("https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=2564&auto=format&fit=crop"),
        media: [],
    },
    {
        id: '2',
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
        createdAt: new Date(),
        updatedAt: new Date(),
        profileMediaId: null,
        profileMedia: createMockMedia("https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=2574&auto=format&fit=crop"),
        media: [],
    },
    {
        id: '3',
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
        createdAt: new Date(),
        updatedAt: new Date(),
        profileMediaId: null,
        profileMedia: createMockMedia("https://images.unsplash.com/photo-1531123897727-8f129e1688ce?q=80&w=2574&auto=format&fit=crop"),
        media: [],
    },
    {
        id: '4',
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
        createdAt: new Date(),
        updatedAt: new Date(),
        profileMediaId: null,
        profileMedia: null as typeof createMockMedia extends () => infer R ? R : never,
        media: [],
    },
    {
        id: '5',
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
        createdAt: new Date(),
        updatedAt: new Date(),
        profileMediaId: null,
        profileMedia: null as typeof createMockMedia extends () => infer R ? R : never,
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
