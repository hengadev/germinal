import { db } from '../src/lib/server/db/index.js';
import {
  events,
  talents,
  eventCategories,
  talentCategories,
  eventSessions
} from '../src/lib/server/db/schema.js';

// ============================================================
// 🚨 PRODUCTION & STAGING GUARD - Prevent accidental data loss
// ============================================================
// This seed script deletes ALL events, talents, and categories before seeding.
// It should NEVER be run in production or staging as it will wipe all data.
const isProduction = process.env.NODE_ENV === 'production';
const isStaging = process.env.NODE_ENV === 'staging';
const isProductionOrStagingDatabase = process.env.DATABASE_URL?.includes('germinal') ||
                                      process.env.DATABASE_URL?.includes('46.225.25.238');

if (isProduction || isStaging || isProductionOrStagingDatabase) {
  const envType = isProduction ? 'PRODUCTION' : (isStaging ? 'STAGING' : 'PRODUCTION/STAGING');
  console.error(`🚨 ERROR: Seed script cannot be run in ${envType}!`);
  console.error('   This script deletes ALL events, talents, and categories data.');
  console.error('   NODE_ENV:', process.env.NODE_ENV || 'not set');
  console.error('   DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@') || 'not set');
  console.error('');
  console.error('   To seed data, run this script in a development environment only.');
  console.error('   Use NODE_ENV=development or a local database.');
  process.exit(1);
}

async function seed() {
  console.log('🌱 Seeding database with mock data...');

  try {
    // ============================================================
    // CLEAR EXISTING DATA (in reverse order of dependencies)
    // ============================================================
    console.log('  🗑️  Clearing existing data...');
    await db.delete(eventSessions);
    await db.delete(events);
    await db.delete(talents);
    await db.delete(talentCategories);
    await db.delete(eventCategories);

    // ============================================================
    // CREATE EVENT CATEGORIES
    // ============================================================
    console.log('  📁 Creating event categories...');
    const [festivalCategory, artsCategory, musicCategory, theaterCategory] = await db.insert(eventCategories).values([
      {
        name: 'festival',
        displayNameEn: 'Festival',
        displayNameFr: 'Festival',
        slug: 'festival',
        descriptionEn: 'Multi-day events featuring various performances, exhibitions, and activities',
        descriptionFr: 'Événements de plusieurs jours avec diverses performances, expositions et activités',
        icon: '🎉',
        color: '#FF6B6B',
        sortOrder: 1,
        published: true,
      },
      {
        name: 'arts',
        displayNameEn: 'Arts & Culture',
        displayNameFr: 'Arts & Culture',
        slug: 'arts-culture',
        descriptionEn: 'Art exhibitions, workshops, and cultural events',
        descriptionFr: 'Expositions d\'art, ateliers et événements culturels',
        icon: '🎨',
        color: '#4ECDC4',
        sortOrder: 2,
        published: true,
      },
      {
        name: 'music',
        displayNameEn: 'Music',
        displayNameFr: 'Musique',
        slug: 'music',
        descriptionEn: 'Live music performances, concerts, and DJ sets',
        descriptionFr: 'Performances musicales en direct, concerts et sets de DJ',
        icon: '🎵',
        color: '#95E1D3',
        sortOrder: 3,
        published: true,
      },
      {
        name: 'theater',
        displayNameEn: 'Theater & Performing Arts',
        displayNameFr: 'Théâtre & Arts Vivants',
        slug: 'theater-performing-arts',
        descriptionEn: 'Theater productions, plays, and performing arts shows',
        descriptionFr: 'Productions théâtrales, pièces de théâtre et spectacles d\'arts vivants',
        icon: '🎭',
        color: '#DDA0DD',
        sortOrder: 4,
        published: true,
      },
    ]).returning();

    // ============================================================
    // CREATE TALENT CATEGORIES
    // ============================================================
    console.log('  👥 Creating talent categories...');
    const [visualArtistsCategory, musiciansCategory, djsCategory, actorsCategory, directorsCategory] = await db.insert(talentCategories).values([
      {
        name: 'visual-artists',
        displayNameEn: 'Visual Artists',
        displayNameFr: 'Artistes Visuels',
        slug: 'visual-artists',
        descriptionEn: 'Painters, sculptors, and mixed media artists',
        descriptionFr: 'Peintres, sculpteurs et artistes multimédias',
        icon: '🖼️',
        color: '#FF6B6B',
        sortOrder: 1,
        published: true,
      },
      {
        name: 'musicians',
        displayNameEn: 'Musicians',
        displayNameFr: 'Musiciens',
        slug: 'musicians',
        descriptionEn: 'Instrumentalists, vocalists, and composers',
        descriptionFr: 'Instrumentistes, vocalistes et compositeurs',
        icon: '🎸',
        color: '#4ECDC4',
        sortOrder: 2,
        published: true,
      },
      {
        name: 'djs',
        displayNameEn: 'DJs & Producers',
        displayNameFr: 'DJ & Producteurs',
        slug: 'djs-producers',
        descriptionEn: 'Electronic music artists and DJs',
        descriptionFr: 'Artistes de musique électronique et DJs',
        icon: '🎧',
        color: '#95E1D3',
        sortOrder: 3,
        published: true,
      },
      {
        name: 'actors',
        displayNameEn: 'Actors & Performers',
        displayNameFr: 'Acteurs & Performeurs',
        slug: 'actors-performers',
        descriptionEn: 'Stage and screen actors, dancers, and performers',
        descriptionFr: 'Acteurs de scène et d\'écran, danseurs et performeurs',
        icon: '🎭',
        color: '#DDA0DD',
        sortOrder: 4,
        published: true,
      },
      {
        name: 'directors',
        displayNameEn: 'Directors & Curators',
        displayNameFr: 'Directeurs & Commissaires',
        slug: 'directors-curators',
        descriptionEn: 'Theater directors, artistic directors, and curators',
        descriptionFr: 'Metteurs en scène, directeurs artistiques et commissaires d\'exposition',
        icon: '🎬',
        color: '#F7DC6F',
        sortOrder: 5,
        published: true,
      },
    ]).returning();

    // ============================================================
    // CREATE EVENTS
    // ============================================================
    console.log('  🎪 Creating events...');

    // Event 1: Urban Canvas - Street Art Festival
    const [urbanCanvasEvent] = await db.insert(events).values([
      {
        titleEn: 'Urban Canvas - Street Art Festival',
        titleFr: 'Toile Urbaine - Festival d\'Art de Rue',
        slug: 'urban-canvas-street-art-festival',
        descriptionEn: 'Join us for three days of vibrant street art, live painting, and creative expression. Watch talented street artists transform blank walls into stunning masterpieces right before your eyes. Participate in interactive workshops, meet the artists, and experience the dynamic energy of urban art culture. This festival celebrates the transformative power of public art and brings together local and international street artists for an unforgettable creative experience.',
        descriptionFr: 'Rejoignez-nous pour trois jours d\'art de rue vibrante, de peinture en direct et d\'expression créative. Regardez des artistes de rue talentueux transformer des murs vierges en chefs-d\'œuvre étonnants juste devant vos yeux. Participez à des ateliers interactifs, rencontrez les artistes et découvrez l\'énergie dynamique de la culture de l\'art urbain. Ce festival célèbre le pouvoir transformateur de l\'art public et réunit des artistes de rue locaux et internationaux pour une expérience créative inoubliable.',
        subtitleEn: 'Where the city becomes your canvas',
        subtitleFr: 'Où la ville devient votre toile',
        startDate: new Date('2026-04-15T00:00:00Z'),
        endDate: new Date('2026-04-17T23:59:00Z'),
        locationEn: 'La Villette, Paris',
        locationFr: 'La Villette, Paris',
        venueNameEn: 'Parc de la Villette',
        venueNameFr: 'Parc de la Villette',
        streetAddressEn: '211 Avenue Jean Jaurès',
        streetAddressFr: '211 Avenue Jean Jaurès',
        districtEn: '19th Arrondissement',
        districtFr: '19ème Arrondissement',
        cityEn: 'Paris',
        cityFr: 'Paris',
        postalCode: '75019',
        countryEn: 'France',
        countryFr: 'France',
        collaboratorsEn: JSON.stringify([
          { name: 'Galerie Itinérance', role: 'Co-organizer' },
          { name: 'Mairie de Paris', role: 'Support' }
        ]),
        collaboratorsFr: JSON.stringify([
          { name: 'Galerie Itinérance', role: 'Co-organisateur' },
          { name: 'Mairie de Paris', role: 'Soutien' }
        ]),
        timingsEn: JSON.stringify([
          { label: 'Gates Open', time: '10:00' },
          { label: 'Live Painting', time: '11:00 - 19:00' },
          { label: 'Workshops', time: '14:00 - 17:00' }
        ]),
        timingsFr: JSON.stringify([
          { label: 'Ouverture', time: '10:00' },
          { label: 'Peinture en direct', time: '11:00 - 19:00' },
          { label: 'Ateliers', time: '14:00 - 17:00' }
        ]),
        curatorEn: 'Marie Dubois',
        curatorFr: 'Marie Dubois',
        materialsEn: 'Spray paint, acrylic, stencils, markers, wall space',
        materialsFr: 'Peinture en spray, acrylique, pochoirs, marqueurs, espace mural',
        admissionInfoEn: 'From €10 - €25 depending on session',
        admissionInfoFr: 'À partir de 10€ - 25€ selon la session',
        categoryId: artsCategory.id,
        published: true,
        isSpotlight: true,
      },
    ]).returning();

    // Event 2: Sunset Beats - Electronic Festival
    const [sunsetBeatsEvent] = await db.insert(events).values([
      {
        titleEn: 'Sunset Beats - Electronic Festival',
        titleFr: 'Sunset Beats - Festival Électronique',
        slug: 'sunset-beats-electronic-festival',
        descriptionEn: 'Experience the ultimate electronic music festival featuring world-renowned DJs and producers. Dance the night away to pulsating beats and immersive soundscapes. With multiple stages, stunning visual effects, and a state-of-the-art sound system, Sunset Beats delivers an unforgettable nightlife experience. From deep house to techno, trance to drum and bass, our carefully curated lineup showcases the best of electronic music culture. Join thousands of music lovers for two nights of pure energy and euphoria.',
        descriptionFr: 'Découvrez le festival de musique électronique ultime présentant des DJs et producteurs de renommée mondiale. Dansez toute la nuit au rythme de beats pulsants et de paysages sonores immersifs. Avec plusieurs scènes, des effets visuels époustouflants et un système de son de pointe, Sunset Beats offre une expérience nocturne inoubliable. De la deep house au techno, de la trance au drum and bass, notre programmation soigneusement sélectionnée présente le meilleur de la culture de la musique électronique. Rejoignez des milliers de mélomanes pour deux nuits d\'énergie pure et d\'euphorie.',
        subtitleEn: 'Two nights of electronic bliss',
        subtitleFr: 'Deux nuits de félicité électronique',
        startDate: new Date('2026-05-02T00:00:00Z'),
        endDate: new Date('2026-05-04T06:00:00Z'),
        locationEn: 'Dock B, Lyon',
        locationFr: 'Dock B, Lyon',
        venueNameEn: 'La Sucrière',
        venueNameFr: 'La Sucrière',
        streetAddressEn: '49 Quai Rambaud',
        streetAddressFr: '49 Quai Rambaud',
        districtEn: 'La Confluence',
        districtFr: 'La Confluence',
        cityEn: 'Lyon',
        cityFr: 'Lyon',
        postalCode: '69002',
        countryEn: 'France',
        countryFr: 'France',
        collaboratorsEn: JSON.stringify([
          { name: 'beatlab Records', role: 'Label Partner' },
          { name: 'Pioneer DJ', role: 'Technical Sponsor' }
        ]),
        collaboratorsFr: JSON.stringify([
          { name: 'beatlab Records', role: 'Partenaire Label' },
          { name: 'Pioneer DJ', role: 'Sponsor Technique' }
        ]),
        timingsEn: JSON.stringify([
          { label: 'Doors Open', time: '17:00' },
          { label: 'Main Stage', time: '18:00 - 03:00' },
          { label: 'Afterparty', time: '03:00 - 06:00' }
        ]),
        timingsFr: JSON.stringify([
          { label: 'Ouverture', time: '17:00' },
          { label: 'Scène Principale', time: '18:00 - 03:00' },
          { label: 'Afterparty', time: '03:00 - 06:00' }
        ]),
        curatorEn: 'DJ Collective Lyon',
        curatorFr: 'Collectif DJ Lyon',
        materialsEn: 'Professional sound system, LED screens, laser shows',
        materialsFr: 'Système sonore professionnel, écrans LED, spectacles laser',
        admissionInfoEn: '€35 per night, €50 weekend pass',
        admissionInfoFr: '35€ la nuit, 50€ pass week-end',
        categoryId: musicCategory.id,
        published: true,
        isSpotlight: false,
      },
    ]).returning();

    // Event 3: Echoes of Tomorrow - Theater
    const [echoesEvent] = await db.insert(events).values([
      {
        titleEn: 'Echoes of Tomorrow - Contemporary Theater',
        titleFr: 'Échos de Demain - Théâtre Contemporain',
        slug: 'echoes-of-tomorrow-theater',
        descriptionEn: 'A groundbreaking theatrical production exploring themes of identity, memory, and human connection in our rapidly changing world. This intimate theater experience features a talented ensemble cast delivering powerful performances that will resonate long after the curtain falls. Written by an award-winning playwright and directed by a visionary theater director, Echoes of Tomorrow pushes the boundaries of contemporary theater with its innovative staging and thought-provoking narrative. Limited seating ensures an immersive experience for every audience member.',
        descriptionFr: 'Une production théâtrale révolutionnaire explorant les thèmes de l\'identité, de la mémoire et de la connexion humaine dans notre monde en rapide évolution. Cette expérience théâtrale intime présente une distribution d\'ensemble talentueux offrant des performances puissantes qui résonneront longtemps après la chute du rideau. Écrite par un dramaturge primé et mise en scène par un directeur de théâtre visionnaire, Échos de Demain repousse les limites du théâtre contemporain avec sa mise en scène innovante et son récit provocateur. Les places limitées garantissent une expérience immersive pour chaque spectateur.',
        subtitleEn: 'A journey into the heart of human experience',
        subtitleFr: 'Un voyage au cœur de l\'expérience humaine',
        startDate: new Date('2026-04-20T00:00:00Z'),
        endDate: new Date('2026-04-26T23:59:00Z'),
        locationEn: 'Le Petit Théâtre, Bordeaux',
        locationFr: 'Le Petit Théâtre, Bordeaux',
        venueNameEn: 'Théâtre de l\'Entre-Sol',
        venueNameFr: 'Théâtre de l\'Entre-Sol',
        streetAddressEn: '12 Rue du Chapeau Rouge',
        streetAddressFr: '12 Rue du Chapeau Rouge',
        districtEn: 'City Center',
        districtFr: 'Centre Ville',
        cityEn: 'Bordeaux',
        cityFr: 'Bordeaux',
        postalCode: '33000',
        countryEn: 'France',
        countryFr: 'France',
        collaboratorsEn: JSON.stringify([
          { name: 'Compagnie du Nouvel Outil', role: 'Production' },
          { name: 'Région Nouvelle-Aquitaine', role: 'Cultural Partner' }
        ]),
        collaboratorsFr: JSON.stringify([
          { name: 'Compagnie du Nouvel Outil', role: 'Production' },
          { name: 'Région Nouvelle-Aquitaine', role: 'Partenaire Culturel' }
        ]),
        timingsEn: JSON.stringify([
          { label: 'Box Office', time: '1 hour before show' },
          { label: 'Performance', time: '2 hours' },
          { label: 'Talkback', time: 'Select shows' }
        ]),
        timingsFr: JSON.stringify([
          { label: 'Billetterie', time: '1 heure avant le spectacle' },
          { label: 'Spectacle', time: '2 heures' },
          { label: 'Discussion', time: 'Sélections de spectacles' }
        ]),
        curatorEn: 'Antoine Martin',
        curatorFr: 'Antoine Martin',
        materialsEn: 'Minimalist set, multimedia projections, live sound design',
        materialsFr: 'Décor minimaliste, projections multimédias, design sonore en direct',
        admissionInfoEn: '€20 - €25 depending on session',
        admissionInfoFr: '20€ - 25€ selon la session',
        categoryId: theaterCategory.id,
        published: true,
        isSpotlight: false,
      },
    ]).returning();

    // ============================================================
    // CREATE EVENT SESSIONS
    // ============================================================
    console.log('  📅 Creating event sessions...');

    // Urban Canvas Sessions
    await db.insert(eventSessions).values([
      {
        eventId: urbanCanvasEvent.id,
        titleEn: 'Opening Night VIP',
        titleFr: 'Vernissage VIP',
        descriptionEn: 'Meet the artists, exclusive preview, complimentary drinks',
        descriptionFr: 'Rencontre avec les artistes, avant-première exclusive, boissons offertes',
        startTime: new Date('2026-04-15T18:00:00Z'),
        endTime: new Date('2026-04-15T23:00:00Z'),
        totalCapacity: 50,
        availableCapacity: 50,
        priceAmount: 2500, // €25.00
        currency: 'EUR',
        published: true,
        allowWaitlist: true,
        badgeType: 'vip',
      },
      {
        eventId: urbanCanvasEvent.id,
        titleEn: 'Day 1 Pass',
        titleFr: 'Pass Journée 1',
        descriptionEn: 'Full access to all exhibitions and live painting sessions',
        descriptionFr: 'Accès complet à toutes les expositions et séances de peinture en direct',
        startTime: new Date('2026-04-15T10:00:00Z'),
        endTime: new Date('2026-04-15T20:00:00Z'),
        totalCapacity: 200,
        availableCapacity: 200,
        priceAmount: 1500, // €15.00
        currency: 'EUR',
        published: true,
        allowWaitlist: true,
        badgeType: 'none',
      },
      {
        eventId: urbanCanvasEvent.id,
        titleEn: 'Day 2 Pass',
        titleFr: 'Pass Journée 2',
        descriptionEn: 'Full access to all exhibitions and artist workshops',
        descriptionFr: 'Accès complet à toutes les expositions et ateliers d\'artistes',
        startTime: new Date('2026-04-16T10:00:00Z'),
        endTime: new Date('2026-04-16T20:00:00Z'),
        totalCapacity: 200,
        availableCapacity: 200,
        priceAmount: 1500, // €15.00
        currency: 'EUR',
        published: true,
        allowWaitlist: true,
        badgeType: 'none',
      },
      {
        eventId: urbanCanvasEvent.id,
        titleEn: 'Day 3 Finale',
        titleFr: 'Grande Finale',
        descriptionEn: 'Closing ceremony, live mural finale, community art project',
        descriptionFr: 'Cérémonie de clôture, fresque finale en direct, projet d\'art communautaire',
        startTime: new Date('2026-04-17T14:00:00Z'),
        endTime: new Date('2026-04-17T18:00:00Z'),
        totalCapacity: 150,
        availableCapacity: 150,
        priceAmount: 1000, // €10.00
        currency: 'EUR',
        published: true,
        allowWaitlist: true,
        badgeType: 'popular',
      },
    ]);

    // Sunset Beats Sessions
    await db.insert(eventSessions).values([
      {
        eventId: sunsetBeatsEvent.id,
        titleEn: 'Friday Night',
        titleFr: 'Vendredi Soir',
        descriptionEn: 'Full festival access Friday night',
        descriptionFr: 'Accès complet au festival vendredi soir',
        startTime: new Date('2026-05-02T17:00:00Z'),
        endTime: new Date('2026-05-03T03:00:00Z'),
        totalCapacity: 300,
        availableCapacity: 300,
        priceAmount: 3500, // €35.00
        currency: 'EUR',
        published: true,
        allowWaitlist: true,
        badgeType: 'none',
      },
      {
        eventId: sunsetBeatsEvent.id,
        titleEn: 'Saturday Night',
        titleFr: 'Samedi Soir',
        descriptionEn: 'Full festival access Saturday night',
        descriptionFr: 'Accès complet au festival samedi soir',
        startTime: new Date('2026-05-03T17:00:00Z'),
        endTime: new Date('2026-05-04T03:00:00Z'),
        totalCapacity: 300,
        availableCapacity: 300,
        priceAmount: 3500, // €35.00
        currency: 'EUR',
        published: true,
        allowWaitlist: true,
        badgeType: 'none',
      },
      {
        eventId: sunsetBeatsEvent.id,
        titleEn: 'Weekend Pass',
        titleFr: 'Pass Week-End',
        descriptionEn: 'Best value! Access to both nights',
        descriptionFr: 'Meilleur prix ! Accès aux deux nuits',
        startTime: new Date('2026-05-02T17:00:00Z'),
        endTime: new Date('2026-05-04T03:00:00Z'),
        totalCapacity: 250,
        availableCapacity: 250,
        priceAmount: 5000, // €50.00
        currency: 'EUR',
        published: true,
        allowWaitlist: true,
        badgeType: 'best_value',
      },
    ]);

    // Echoes of Tomorrow Sessions
    await db.insert(eventSessions).values([
      {
        eventId: echoesEvent.id,
        titleEn: 'Opening Night',
        titleFr: 'Première',
        descriptionEn: 'Gala performance with post-show talkback',
        descriptionFr: 'Spectacle gala avec discussion après le spectacle',
        startTime: new Date('2026-04-20T19:30:00Z'),
        endTime: new Date('2026-04-20T21:30:00Z'),
        totalCapacity: 40,
        availableCapacity: 40,
        priceAmount: 2500, // €25.00
        currency: 'EUR',
        published: true,
        allowWaitlist: true,
        badgeType: 'featured',
      },
      {
        eventId: echoesEvent.id,
        titleEn: 'Thursday Evening',
        titleFr: 'Jeudi Soir',
        descriptionEn: 'Regular evening performance',
        descriptionFr: 'Représentation en soirée standard',
        startTime: new Date('2026-04-23T19:30:00Z'),
        endTime: new Date('2026-04-23T21:30:00Z'),
        totalCapacity: 40,
        availableCapacity: 40,
        priceAmount: 2500, // €25.00
        currency: 'EUR',
        published: true,
        allowWaitlist: true,
        badgeType: 'none',
      },
      {
        eventId: echoesEvent.id,
        titleEn: 'Saturday Matinee',
        titleFr: 'Samedi Après-Midi',
        descriptionEn: 'Afternoon performance (discounted)',
        descriptionFr: 'Représentation de l\'après-midi (tarif réduit)',
        startTime: new Date('2026-04-25T15:00:00Z'),
        endTime: new Date('2026-04-25T17:00:00Z'),
        totalCapacity: 40,
        availableCapacity: 40,
        priceAmount: 2000, // €20.00
        currency: 'EUR',
        published: true,
        allowWaitlist: true,
        badgeType: 'none',
      },
      {
        eventId: echoesEvent.id,
        titleEn: 'Saturday Evening',
        titleFr: 'Samedi Soir',
        descriptionEn: 'Prime time evening performance',
        descriptionFr: 'Représentation en soirée de première qualité',
        startTime: new Date('2026-04-25T20:30:00Z'),
        endTime: new Date('2026-04-25T22:30:00Z'),
        totalCapacity: 40,
        availableCapacity: 40,
        priceAmount: 2500, // €25.00
        currency: 'EUR',
        published: true,
        allowWaitlist: true,
        badgeType: 'popular',
      },
      {
        eventId: echoesEvent.id,
        titleEn: 'Sunday Matinee',
        titleFr: 'Dimanche Après-Midi',
        descriptionEn: 'Final performance with Q&A session',
        descriptionFr: 'Dernière représentation avec session Q&R',
        startTime: new Date('2026-04-26T15:00:00Z'),
        endTime: new Date('2026-04-26T17:00:00Z'),
        totalCapacity: 40,
        availableCapacity: 40,
        priceAmount: 2000, // €20.00
        currency: 'EUR',
        published: true,
        allowWaitlist: true,
        badgeType: 'limited',
      },
    ]);

    // ============================================================
    // CREATE TALENTS
    // ============================================================
    console.log('  👥 Creating talents...');

    // Visual Artists for Urban Canvas
    await db.insert(talents).values([
      {
        firstNameEn: 'Maya',
        firstNameFr: 'Maya',
        lastName: 'Fontaine',
        roleEn: 'Street Artist & Muralist',
        roleFr: 'Artiste de Rue & Muraliste',
        bioEn: 'Maya Fontaine is a renowned street artist known for her vibrant, large-scale murals that transform urban spaces into colorful celebrations of community and culture. Based in Marseille, her work blends traditional graffiti techniques with contemporary artistic vision, creating pieces that are both visually stunning and socially meaningful.',
        bioFr: 'Maya Fontaine est une artiste de rue renommée pour ses fresques vibrantes à grande échelle qui transforment les espaces urbains en célébrations colorées de la communauté et de la culture. Basée à Marseille, son travail mélange des techniques de graffiti traditionnelles avec une vision artistique contemporaine, créant des pièces à la fois visuellement étonnantes et socialement significatives.',
        city: 'Marseille',
        country: 'France',
        quoteEn: 'Every wall is an opportunity to start a conversation.',
        quoteFr: 'Chaque mur est une opportunité de commencer une conversation.',
        specializationsEn: JSON.stringify(['Street Art', 'Murals', 'Community Art', 'Graffiti']),
        specializationsFr: JSON.stringify(['Art de Rue', 'Fresques', 'Art Communautaire', 'Graffiti']),
        socialLinks: JSON.stringify({
          instagram: 'https://instagram.com/mayafontaine.art',
          website: 'https://mayafontaine.com'
        }),
        categoryId: visualArtistsCategory.id,
        published: true,
      },
      {
        firstNameEn: 'Marcus',
        firstNameFr: 'Marcus',
        lastName: 'Dubois',
        roleEn: 'Mixed Media Artist',
        roleFr: 'Artiste Multimédia',
        bioEn: 'Marcus Dubois creates innovative mixed media installations that challenge perceptions of urban space. His work incorporates found objects, recycled materials, and digital projections to create immersive environments that tell stories about the cities we inhabit.',
        bioFr: 'Marcus Dubois crée des installations multimédias innovantes qui défient la perception de l\'espace urbain. Son travail incorpore des objets trouvés, des matériaux recyclés et des projections numériques pour créer des environnements immersifs qui racontent des histoires sur les villes que nous habitons.',
        city: 'Lyon',
        country: 'France',
        quoteEn: 'Art is the language of the streets.',
        quoteFr: 'L\'art est le langage de la rue.',
        specializationsEn: JSON.stringify(['Mixed Media', 'Installations', 'Recycled Art', 'Digital Projections']),
        specializationsFr: JSON.stringify(['Multimédia', 'Installations', 'Art Recyclé', 'Projections Numériques']),
        socialLinks: JSON.stringify({
          instagram: 'https://instagram.com/marcusdubois.art',
          twitter: 'https://twitter.com/marcusdubois'
        }),
        categoryId: visualArtistsCategory.id,
        published: true,
      },
    ]);

    // DJs for Sunset Beats
    await db.insert(talents).values([
      {
        firstNameEn: 'Aurora',
        firstNameFr: 'Aurora',
        lastName: 'Pulse',
        roleEn: 'DJ & Producer',
        roleFr: 'DJ & Productrice',
        bioEn: 'Aurora Pulse has been dominating the European electronic music scene for over a decade. Known for her ethereal melodies and driving basslines, she creates transcendent sets that take listeners on journey through sound. Her releases on leading electronic labels have garnered millions of streams worldwide.',
        bioFr: 'Aurora Pulse domine la scène de la musique électronique européenne depuis plus d\'une décennie. Connue pour ses mélodies éthérées et ses lignes de basse percutantes, elle crée des sets transcendants qui emmènent les auditeurs dans un voyage à travers le son. Ses sorties sur des labels électroniques de premier plan ont recueilli des millions de streams dans le monde entier.',
        city: 'Berlin',
        country: 'Germany',
        quoteEn: 'Music is the soundtrack to your best memories.',
        quoteFr: 'La musique est la bande-son de vos meilleurs souvenirs.',
        specializationsEn: JSON.stringify(['Deep House', 'Techno', 'Progressive', 'Live Sets']),
        specializationsFr: JSON.stringify(['Deep House', 'Techno', 'Progressive', 'Sets Live']),
        socialLinks: JSON.stringify({
          instagram: 'https://instagram.com/aurorapulse',
          soundcloud: 'https://soundcloud.com/aurorapulse'
        }),
        categoryId: djsCategory.id,
        published: true,
      },
      {
        firstNameEn: 'DJ',
        firstNameFr: 'DJ',
        lastName: 'Neon',
        roleEn: 'Electronic Music Producer',
        roleFr: 'Producteur de Musique Électronique',
        bioEn: 'DJ Neon brings high-energy electronic music to every performance. With a background in sound engineering and a passion for cutting-edge production techniques, his sets are masterclasses in electronic music perfection. From festival main stages to intimate clubs, DJ Neon delivers unforgettable experiences.',
        bioFr: 'DJ Neon apporte une musique électronique à haute énergie à chaque performance. Avec un background en ingénierie sonore et une passion pour les techniques de production de pointe, ses sets sont des maîtres-classes de perfection musicale électronique. Des scènes principales de festivals aux clubs intimes, DJ Neon offre des expériences inoubliables.',
        city: 'Paris',
        country: 'France',
        quoteEn: 'The night is alive when the bass drops.',
        quoteFr: 'La nuit s\'anime quand la basse descend.',
        specializationsEn: JSON.stringify(['EDM', 'Electro House', 'Trap', 'Festival Sets']),
        specializationsFr: JSON.stringify(['EDM', 'Electro House', 'Trap', 'Sets de Festival']),
        socialLinks: JSON.stringify({
          instagram: 'https://instagram.com/djneon',
          spotify: 'https://open.spotify.com/artist/djneon'
        }),
        categoryId: djsCategory.id,
        published: true,
      },
    ]);

    // Theater talent for Echoes of Tomorrow
    await db.insert(talents).values([
      {
        firstNameEn: 'Sophie',
        firstNameFr: 'Sophie',
        lastName: 'Mercier',
        roleEn: 'Theater Director',
        roleFr: 'Metteur en Scène',
        bioEn: 'Sophie Mercier is an award-winning theater director known for her innovative approach to contemporary theater. Her productions have been featured in major theater festivals across Europe and have received critical acclaim for their emotional depth and technical artistry. She is the founder of Compagnie du Nouvel Outil.',
        bioFr: 'Sophie Mercier est une metteuse en scène primée connue pour son approche innovante du théâtre contemporain. Ses productions ont été présentées dans des grands festivals de théâtre à travers l\'Europe et ont reçu des critiques élogieuses pour leur profondeur émotionnelle et leur artisterie technique. Elle est la fondatrice de la Compagnie du Nouvel Outil.',
        city: 'Bordeaux',
        country: 'France',
        quoteEn: 'Theater is a mirror that reflects who we are and who we could be.',
        quoteFr: 'Le théâtre est un miroir qui reflète qui nous sommes et qui nous pourrions être.',
        specializationsEn: JSON.stringify(['Directing', 'Playwriting', 'Contemporary Theater', 'Site-specific Works']),
        specializationsFr: JSON.stringify(['Mise en Scène', 'Écriture', 'Théâtre Contemporain', 'Créations In Situ']),
        socialLinks: JSON.stringify({
          linkedin: 'https://linkedin.com/in/sophiemercier',
          website: 'https://compagniedunouveloutil.fr'
        }),
        categoryId: directorsCategory.id,
        published: true,
      },
      {
        firstNameEn: 'Lucas',
        firstNameFr: 'Lucas',
        lastName: 'Moreau',
        roleEn: 'Actor',
        roleFr: 'Acteur',
        bioEn: 'Lucas Moreau is a versatile stage and screen actor with a passion for contemporary theater. Trained at the prestigious National Conservatory of Dramatic Art, he brings authenticity and emotional depth to every role. His performances in "Echoes of Tomorrow" have earned him critical recognition and audience admiration.',
        bioFr: 'Lucas Moreau est un acteur de scène et d\'écran polyvalent passionné par le théâtre contemporain. Formé au prestigieux Conservatoire National d\'Art Dramatique, il apporte authenticité et profondeur émotionnelle à chaque rôle. Ses performances dans "Échos de Demain" lui ont valu une reconnaissance critique et l\'admiration du public.',
        city: 'Paris',
        country: 'France',
        quoteEn: 'Every performance is a new discovery.',
        quoteFr: 'Chaque performance est une nouvelle découverte.',
        specializationsEn: JSON.stringify(['Stage Acting', 'Contemporary Theater', 'Physical Theater', 'Improv']),
        specializationsFr: JSON.stringify(['Jeu de Scène', 'Théâtre Contemporain', 'Théâtre Physique', 'Improvisation']),
        socialLinks: JSON.stringify({
          instagram: 'https://instagram.com/lucasmoreau',
          twitter: 'https://twitter.com/lucasmoreau'
        }),
        categoryId: actorsCategory.id,
        published: true,
      },
    ]);

    // Additional musicians
    await db.insert(talents).values([
      {
        firstNameEn: 'Zoe',
        firstNameFr: 'Zoé',
        lastName: 'Lambert',
        roleEn: 'Musician & Composer',
        roleFr: 'Musicienne & Compositrice',
        bioEn: 'Zoé Lambert is a classically trained musician who seamlessly bridges the worlds of classical and contemporary music. Her compositions for theater and dance productions have earned her acclaim across France. She specializes in creating atmospheric soundscapes that enhance theatrical performances.',
        bioFr: 'Zoé Lambert est une musicienne formée classiquement qui fait le pont entre les mondes de la musique classique et contemporaine. Ses compositions pour des productions de théâtre et de danse lui ont valu des éloges à travers la France. Elle se spécialise dans la création de paysages sonores atmosphériques qui améliorent les performances théâtrales.',
        city: 'Lyon',
        country: 'France',
        quoteEn: 'Music speaks where words fail.',
        quoteFr: 'La musique parle là où les mots échouent.',
        specializationsEn: JSON.stringify(['Composition', 'Piano', 'Sound Design', 'Live Performance']),
        specializationsFr: JSON.stringify(['Composition', 'Piano', 'Design Sonore', 'Performance Live']),
        socialLinks: JSON.stringify({
          instagram: 'https://instagram.com/zoelambert',
          website: 'https://zoelambert.com'
        }),
        categoryId: musiciansCategory.id,
        published: true,
      },
    ]);

    console.log('✅ Database seeded successfully!');
    console.log('   - 4 event categories created');
    console.log('   - 5 talent categories created');
    console.log('   - 3 events created');
    console.log('   - 12 event sessions created');
    console.log('   - 7 talents created');
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
