/* Opt-in demo library. Clearly labelled sample data so the interface can be explored without a
 * provider. Never added automatically. All names are invented; artwork is generated locally. */
(function () {
  'use strict';
  var SH = window.SH;
  var STREAM = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';   // public HLS test stream

  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul ? Math.imul(a ^ (a >>> 15), 1 | a) : ((a ^ (a >>> 15)) * (1 | a)) | 0; t = (t + (Math.imul ? Math.imul(t ^ (t >>> 7), 61 | t) : ((t ^ (t >>> 7)) * (61 | t)) | 0)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* Abstract generated artwork (SVG data URI): layered shapes in two related hues. */
  function art(label, w, h, logo) {
    var r = rng(SH.hash(label)), hue = Math.floor(r() * 360), hue2 = (hue + 30 + Math.floor(r() * 50)) % 360, s = '';
    s += '<rect width="' + w + '" height="' + h + '" fill="hsl(' + hue + ',42%,' + (logo ? 20 : 16) + '%)"/>';
    if (!logo) {
      for (var i = 0; i < 4; i++) {
        var cxp = Math.floor(r() * w), cyp = Math.floor(r() * h), rad = Math.floor((0.25 + r() * 0.45) * Math.max(w, h));
        s += '<circle cx="' + cxp + '" cy="' + cyp + '" r="' + rad + '" fill="hsl(' + (i % 2 ? hue2 : hue) + ',' + (45 + Math.floor(r() * 20)) + '%,' + (24 + Math.floor(r() * 22)) + '%)" opacity="' + (0.35 + r() * 0.3).toFixed(2) + '"/>';
      }
      s += '<rect x="' + Math.floor(w * (0.1 + r() * 0.5)) + '" y="0" width="' + Math.floor(w * 0.08) + '" height="' + h + '" fill="hsl(' + hue2 + ',70%,70%)" opacity="0.10" transform="skewX(-18)"/>';
    } else {
      var ini = label.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(function (x) { return x.charAt(0).toUpperCase(); }).join('');
      s += '<circle cx="' + w / 2 + '" cy="' + h / 2 + '" r="' + h * 0.36 + '" fill="none" stroke="hsl(' + hue2 + ',70%,72%)" stroke-width="' + h * 0.035 + '" opacity="0.8"/>';
      s += '<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-weight="700" font-size="' + h * 0.3 + '" fill="#F5F7FC">' + ini + '</text>';
    }
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '">' + s + '</svg>');
  }

  var CH = {
    News: ['Meridian News', 'Harbor 24', 'Northline World', 'Civic Report'],
    Sports: ['Arena One', 'Arena Two', 'Pitchside', 'Velocity Motorsport', 'Baseline Tennis'],
    Movies: ['Cinema Vault', 'Midnight Reel', 'Golden Era Films', 'Frontier Action'],
    Entertainment: ['Haven One', 'Brightside', 'Studio Nine', 'Parlour Comedy'],
    Kids: ['Pebble Kids', 'Tumble TV', 'Little Orbit'],
    Documentary: ['Terra Docs', 'Deep Field', 'Chronicle History', 'Wildmark'],
    Music: ['Pulse Hits', 'Vinyl Lounge', 'Stage Live'],
    Lifestyle: ['Table and Vine', 'Homecraft', 'Trailhead Travel']
  };
  var PROG = {
    News: ['Morning Briefing', 'World Report', 'The Midday Desk', 'Business Hour', 'Evening Headlines', 'Press Review', 'Weather Outlook', 'The Long View', 'Nightline Update'],
    Sports: ['Matchday Live', 'The Final Whistle', 'Classic Fixtures', 'Transfer Talk', 'Grand Prix Qualifying', 'Court Report', 'Highlights Hour', 'The Locker Room', 'Trackside'],
    Movies: ['Feature Presentation', 'Late Night Double Bill', 'Director Spotlight', 'Matinee Classic', 'Premiere Night', 'Cult Favourites', 'Short Film Showcase'],
    Entertainment: ['The Late Sofa', 'Quiz Night', 'Open Mic', 'Backstage Pass', 'Home Makeover', 'The Panel', 'Talent Trail', 'Weekend Kitchen'],
    Kids: ['Pebble and Friends', 'Rocket Club', 'Story Tree', 'Number Jungle', 'Puppet Parade', 'Tiny Explorers', 'Bedtime Tales'],
    Documentary: ['Planet in Motion', 'Lost Cities', 'Engineering Giants', 'Ocean Frontiers', 'A Century in Colour', 'The Night Sky', 'Wild Coasts', 'Inside the Machine'],
    Music: ['Top 40 Countdown', 'Unplugged Sessions', 'Festival Replay', 'Vinyl Hour', 'New Music Friday', 'Legends in Concert'],
    Lifestyle: ['Market to Table', 'Weekend Workshop', 'Great Rail Journeys', 'Small Spaces', 'The Garden Year', 'City Breaks']
  };
  var DESC = ['A closer look at the stories and people shaping the week.', 'Fresh episodes, familiar faces and a few surprises along the way.', 'An in-depth special with expert guests and exclusive footage.', 'Catch up on everything you may have missed.', 'A new instalment in the long-running favourite.'];
  var COUNTRIES = ['GB', 'US', 'IN', 'DE', 'FR', 'ES'];

  var MOVIES = [
    ['The Last Lighthouse', 2021, 'Drama,Mystery', 112, 7.8, 'A keeper returning to a decommissioned lighthouse finds the logbook is still being written.'],
    ['Paper Satellites', 2019, 'Sci-Fi,Drama', 104, 7.2, 'Two amateur radio operators pick up a signal that should have stopped transmitting decades ago.'],
    ['Northbound', 2023, 'Thriller', 98, 6.9, 'A night train, a missing passenger, and a conductor who remembers everything.'],
    ['A Quiet Tide', 2018, 'Romance,Drama', 101, 7.1, 'Two strangers share a ferry crossing every morning for a year before either says a word.'],
    ['Ironwood', 2022, 'Action,Adventure', 124, 7.4, 'A forest ranger is the only thing standing between a logging cartel and the last old-growth valley.'],
    ['The Cartographer\'s Daughter', 2020, 'Adventure,Family', 109, 7.6, 'An unfinished map leads a young girl across three countries in search of its final island.'],
    ['Static Bloom', 2024, 'Sci-Fi,Thriller', 117, 7.0, 'A botanist discovers her greenhouse is growing something that responds to broadcast signals.'],
    ['Harvest Moon Motel', 2017, 'Comedy', 94, 6.8, 'A failing roadside motel becomes the unlikely venue for a very competitive wedding.'],
    ['Glass Harbor', 2022, 'Crime,Drama', 128, 8.1, 'A dockside detective unravels a smuggling ring that reaches into her own precinct.'],
    ['Fable of the Fox', 2021, 'Animation,Family', 88, 7.9, 'A timid fox must outwit winter itself to bring spring back to the valley.'],
    ['Low Orbit', 2025, 'Sci-Fi,Action', 121, 7.3, 'When a maintenance crew is stranded above the planet, the only way home is through the debris field.'],
    ['Second Wind', 2019, 'Sport,Drama', 106, 7.5, 'A retired marathon coach takes on one last runner nobody else believes in.'],
    ['The Clockmaker\'s Apprentice', 2016, 'Fantasy,Adventure', 115, 7.0, 'Every clock in the city stops at once, and only an apprentice knows why.'],
    ['Night Ferry', 2023, 'Mystery,Thriller', 99, 6.7, 'Twelve passengers board. By morning, the manifest says there were only ever eleven.'],
    ['Saltwater Summer', 2020, 'Comedy,Romance', 96, 6.6, 'A city chef inherits a seaside chip shop and a very opinionated rival next door.'],
    ['Embers', 2024, 'Drama', 110, 7.7, 'Three siblings return to the family vineyard after the fire to decide what is worth rebuilding.'],
    ['Granite', 2018, 'Documentary', 86, 7.9, 'A year on the wall with the climbers attempting a route no one has finished.'],
    ['Wild Frequencies', 2022, 'Music,Documentary', 92, 7.4, 'The story of a pirate radio station that changed the sound of a generation.'],
    ['Kingdom of Kites', 2023, 'Animation,Adventure', 91, 7.8, 'In a city in the clouds, a kite-maker\'s son learns why the wind has stopped.'],
    ['Long Way to Morning', 2021, 'Drama', 119, 7.3, 'An overnight taxi shift becomes a portrait of a city that never quite sleeps.']
  ];
  var SERIES = [
    ['Harbor Lights', 2022, 'Drama', 8.0, 'A coastal town, a new harbourmaster, and decades of secrets carried in on the tide.'],
    ['Copper Valley', 2020, 'Western,Drama', 7.6, 'A frontier mining town fights to stay on the map when the copper runs thin.'],
    ['Night Shift at Marlow\'s', 2023, 'Comedy', 7.4, 'The overnight crew of a 24-hour diner serve coffee, chaos and questionable advice.'],
    ['Atlas Unknown', 2021, 'Documentary', 8.3, 'Journeys to the places that maps left blank.'],
    ['Little Orbit Adventures', 2024, 'Animation,Kids', 7.2, 'A crew of small astronauts explore one very big neighbourhood.'],
    ['Cold Ledger', 2022, 'Crime,Thriller', 7.9, 'A forensic accountant follows the money into places the police will not go.']
  ];
  var EP_TITLES = ['Arrivals', 'What the Tide Brings', 'Small Hours', 'The Long Way Round', 'Crosswinds', 'A Matter of Record', 'Second Thoughts', 'Homecoming'];
  var PEOPLE = ['Mara Ellison', 'Tobias Renn', 'Anika Verma', 'Jonah Whitlock', 'Sofia Castellan', 'Idris Okoye', 'Lena Hartmann', 'Felix Moreau', 'Priya Nair', 'Callum Doyle'];

  function schedule(cat, name) {
    var r = rng(SH.hash('epg' + name)), pool = PROG[cat], out = [], d = new Date();
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime(), end = t + 3 * 864e5, lens = cat === 'Movies' ? [90, 120, 120, 150] : (cat === 'Sports' ? [60, 120, 120, 30] : [30, 30, 60, 60, 90]);
    while (t < end) {
      var len = lens[Math.floor(r() * lens.length)] * 60000;
      out.push({ s: t, e: t + len, t: pool[Math.floor(r() * pool.length)], d: DESC[Math.floor(r() * DESC.length)], c: cat });
      t += len;
    }
    return out;
  }

  SH.Demo = {
    art: art,
    build: function () {
      var out = { channels: [], movies: [], series: [], epg: {} }, n = 0, now = Date.now(), cat, i;
      for (cat in CH) {
        for (i = 0; i < CH[cat].length; i++) {
          var name = CH[cat][i], id = 'demo.' + SH.norm(name).replace(/ /g, '');
          out.channels.push({ name: name, logo: art(name, 240, 240, true), group: cat, country: COUNTRIES[n % COUNTRIES.length], tvgId: id, url: STREAM + '?ch=' + n });
          out.epg[id] = schedule(cat, name);
          n++;
        }
      }
      for (i = 0; i < MOVIES.length; i++) {
        var m = MOVIES[i], r = rng(SH.hash(m[0]));
        out.movies.push({ title: m[0], year: m[1], genres: m[2].split(','), duration: m[3] * 60, rating: m[4], plot: m[5], poster: art(m[0], 300, 450), backdrop: art(m[0] + 'bg', 960, 540),
          director: PEOPLE[Math.floor(r() * PEOPLE.length)], cast: [PEOPLE[Math.floor(r() * 5)], PEOPLE[5 + Math.floor(r() * 5)]], added: now - i * 864e5 * 2, url: STREAM + '?m=' + i });
      }
      for (i = 0; i < SERIES.length; i++) {
        var s = SERIES[i], eps = [], rs = rng(SH.hash(s[0]));
        for (var se = 1; se <= 2; se++) for (var e = 1; e <= 6; e++) eps.push({ season: se, number: e, title: EP_TITLES[Math.floor(rs() * EP_TITLES.length)], plot: DESC[Math.floor(rs() * DESC.length)], duration: (38 + Math.floor(rs() * 20)) * 60, url: STREAM + '?s=' + i + '&e=' + se + '.' + e });
        out.series.push({ title: s[0], year: s[1], genres: s[2].split(','), rating: s[3], plot: s[4], poster: art(s[0], 300, 450), backdrop: art(s[0] + 'bg', 960, 540), episodes: eps, added: now - i * 864e5 * 3 - 864e5 });
      }
      return out;
    }
  };
})();
