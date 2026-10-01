/* =========================================
   RE:CORD
   Music Discovery
========================================= */


/* =========================================
   SHUFFLE DISCOVERY SETTINGS
========================================= */

/*
  These are currently used behind the scenes.

  Later, these same values can power visible
  Genre and Decade filters in the interface.
*/

const shuffleGenres = [
  "rock",
  "alternative rock",
  "indie rock",
  "post-punk",
  "electronic",
  "house",
  "techno",
  "hip hop",
  "r&b",
  "soul",
  "funk",
  "pop",
  "jazz",
  "punk",
  "metal",
  "shoegaze",
  "dream pop",
  "psychedelic rock"
];


const shuffleDecades = [
  {
    label: "1960s",
    start: 1960,
    end: 1969
  },
  {
    label: "1970s",
    start: 1970,
    end: 1979
  },
  {
    label: "1980s",
    start: 1980,
    end: 1989
  },
  {
    label: "1990s",
    start: 1990,
    end: 1999
  },
  {
    label: "2000s",
    start: 2000,
    end: 2009
  },
  {
    label: "2010s",
    start: 2010,
    end: 2019
  },
  {
    label: "2020s",
    start: 2020,
    end: 2026
  }
];


/* =========================================
   PAGE ELEMENTS
========================================= */

const shuffleButton =
  document.getElementById("shuffle-button");

const shuffleResult =
  document.getElementById("shuffle-result");

const shuffleGenreFilter =
  document.getElementById(
    "shuffle-genre"
  );

const shuffleDecadeFilter =
  document.getElementById(
    "shuffle-decade"
  );

const searchInput =
  document.getElementById("album-search");

const searchButton =
  document.getElementById("search-submit");

const searchResults =
  document.getElementById("search-results");


/* =========================================
   SEARCH STATE
========================================= */

let currentSearchLabel =
  "Search Results";

/* =========================================
   MUSICBRAINZ REQUEST MANAGER
========================================= */

/*
  MusicBrainz asks applications to keep API
  requests spaced out. Search, Shuffle, and
  album details all use this shared queue.
*/

let musicBrainzQueue = Promise.resolve();
let lastMusicBrainzRequest = 0;

const MUSICBRAINZ_DELAY = 1100;


function wait(milliseconds) {

  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        milliseconds
      )
  );

}


async function musicBrainzFetch(url) {

  const request =
    musicBrainzQueue.then(
      async () => {

        const now =
          Date.now();


        const elapsed =
          now -
          lastMusicBrainzRequest;


        const remainingDelay =
          Math.max(
            0,
            MUSICBRAINZ_DELAY -
            elapsed
          );


        if (
          remainingDelay > 0
        ) {

          await wait(
            remainingDelay
          );

        }


        lastMusicBrainzRequest =
          Date.now();


        let response =
          await fetch(url);


        /*
          If MusicBrainz temporarily throttles
          the request, wait and retry once.
        */

        if (
          response.status === 503
        ) {

          console.warn(
            "MusicBrainz is busy or rate limiting. Retrying..."
          );


          await wait(
            2200
          );


          lastMusicBrainzRequest =
            Date.now();


          response =
            await fetch(url);

        }


        return response;

      }
    );


  /*
    Keep the queue usable even if a request
    fails with a network error.
  */

  musicBrainzQueue =
    request.catch(
      () => {}
    );


  return request;

}


/* =========================================
   API-POWERED SHUFFLE
========================================= */

let previousShuffleId = null;

async function shuffleAlbum() {

  /*
    Prevent repeated clicks while MusicBrainz
    is responding.
  */

  if (!shuffleResult || !shuffleButton) {
    return;
  }


  shuffleButton.disabled = true;


  shuffleButton.innerHTML = `
    <span class="shuffle-icon">↝</span>
    Finding a record...
  `;


  /*
    Keep the physical crate visible while
    MusicBrainz searches for a record.
  */

  shuffleResult.innerHTML = `
    <div class="shuffle-crate shuffle-crate-loading">

      <img
        src="assets/record-crate.png"
        class="shuffle-crate-image"
        alt="RE:CORD crate filled with vinyl records"
      >

      <div class="crate-loading-label">
        DIGGING THROUGH THE CRATES...
      </div>

    </div>
  `;


  /*
    If one random genre / decade combination
    doesn't return a suitable album, silently
    try another combination.

    We stop after 3 attempts so we don't make
    excessive requests to MusicBrainz.
  */

  const maxAttempts = 3;


  try {

    for (
      let attempt = 1;
      attempt <= maxAttempts;
      attempt++
    ) {

      /*
        STEP 1

        Randomly choose a genre and decade.
      */

      /* -----------------------------------------
   APPLY SHUFFLE FILTERS
----------------------------------------- */

const selectedGenre =
  shuffleGenreFilter?.value ||
  "any";

const selectedDecade =
  shuffleDecadeFilter?.value ||
  "any";


/*
  If the visitor selected a genre,
  use it.

  Otherwise preserve the original
  random Shuffle behavior.
*/

const genre =
  selectedGenre !== "any"
    ? selectedGenre
    : randomItem(
        shuffleGenres
      );


/*
  Find the selected decade object.

  If "Any decade" is selected,
  preserve the original random behavior.
*/

const decade =
  selectedDecade !== "any"
    ? shuffleDecades.find(
        (item) =>
          item.label ===
          selectedDecade
      )
    : randomItem(
        shuffleDecades
      );


      /*
        STEP 2

        Build the same MusicBrainz query that
        our original working Shuffle used.

        We want:

        - Albums
        - Official releases
        - Matching genre/tag
        - Matching decade
      */

      const query =
        `tag:"${escapeLucene(genre)}" ` +
        `AND primarytype:album ` +
        `AND status:official ` +
        `AND firstreleasedate:[${decade.start}-01-01 TO ${decade.end}-12-31]`;


      const url =
        "https://musicbrainz.org/ws/2/release-group/" +
        "?query=" +
        encodeURIComponent(query) +
        "&fmt=json" +
        "&limit=100";


      /*
        IMPORTANT:

        Use the existing shared MusicBrainz
        request manager.

        Search, Shuffle, and album details all
        use musicBrainzFetch().
      */

      let response;


      try {

        response =
          await musicBrainzFetch(
            url
          );

      }

      catch (requestError) {

        console.warn(
          `RE:CORD Shuffle attempt ${attempt} request failed:`,
          requestError
        );


        /*
          Try another combination unless this
          was our final attempt.
        */

        if (
          attempt < maxAttempts
        ) {

          continue;

        }


        throw requestError;

      }


      /*
        MusicBrainz returned an HTTP error.

        Allow another attempt before giving up.
      */

      if (!response.ok) {

        console.warn(
          `RE:CORD Shuffle attempt ${attempt} returned status ${response.status}.`
        );


        if (
          attempt < maxAttempts
        ) {

          continue;

        }


        throw new Error(
          `Shuffle request failed: ${response.status}`
        );

      }


      const data =
        await response.json();


      let candidates =
        data["release-groups"] || [];


      /*
        STEP 3

        Remove live albums, compilations,
        remix albums, soundtracks, etc.

        This uses the same standard-album
        filter used by Search.
      */

      candidates =
        candidates.filter(
          (release) =>
            isStandardAlbum(
              release
            )
        );


      /*
        Remove results without a usable
        title or artist.
      */

      candidates =
        candidates.filter(
          (release) =>
            release.title &&
            release["artist-credit"]?.[0]?.name
        );


      /*
        Remove duplicate release groups.
      */

      candidates =
        removeDuplicateReleaseGroups(
          candidates
        );


      /*
        Avoid immediately showing the same
        album twice in a row.
      */

      if (
        previousShuffleId &&
        candidates.length > 1
      ) {

        candidates =
          candidates.filter(
            (release) =>
              release.id !==
              previousShuffleId
          );

      }


      /*
        If this particular genre / decade
        combination produced nothing usable,
        don't show an error yet.

        Pick another combination and retry.
      */

      if (
        candidates.length === 0
      ) {

        console.log(
          `RE:CORD Shuffle attempt ${attempt}: no suitable records found.`
        );


        continue;

      }


      /*
        STEP 4

        MusicBrainz tends to rank its most
        obvious results first.

        Keep the stronger first portion of
        the results, but randomly select
        within that collection.
      */

      const discoveryPool =
        candidates.slice(
          0,
          Math.min(
            candidates.length,
            40
          )
        );


      const album =
        randomItem(
          discoveryPool
        );


      /*
        Remember this album so the next
        Shuffle doesn't immediately repeat it.
      */

      previousShuffleId =
        album.id;


      /*
        STEP 5

        SUCCESS

        displayShuffleAlbum() is the function
        containing our new crate / rising
        record presentation.

        We are deliberately leaving that
        function untouched.
      */

      displayShuffleAlbum(
        album,
        genre,
        decade
      );


      /*
        A record was found.

        Exit shuffleAlbum() immediately so
        the remaining attempts don't run.
      */

      return;

    }


    /*
      If execution reaches this point, all
      three combinations returned zero usable
      candidates.
    */

    throw new Error(
      "No suitable Shuffle candidates after 3 attempts."
    );

  }

  catch (error) {

    console.error(
      "RE:CORD Shuffle error:",
      error
    );


    /*
      Only show the failure message after
      every automatic attempt has failed.
    */

    shuffleResult.innerHTML = `
      <div class="shuffle-placeholder">

        <p>
          Couldn't find a record.<br>
          Give the crates another spin.
        </p>

      </div>
    `;

  }

  finally {

    /*
      Always restore the Shuffle button,
      whether the request succeeded or failed.
    */

    shuffleButton.disabled =
      false;


    shuffleButton.innerHTML = `
      <span class="shuffle-icon">↝</span>
      Find an album
    `;

  }

}


/* =========================================
   DISPLAY SHUFFLE ALBUM
========================================= */

function displayShuffleAlbum(
  album,
  genre,
  decade
) {

  const artist =
    album["artist-credit"]?.[0]?.name ||
    "Unknown Artist";

  const title =
    album.title ||
    "Unknown Album";

  const date =
    album["first-release-date"] || "";

  const year =
    date
      ? date.substring(0, 4)
      : "—";

  const coverURL =
    `https://coverartarchive.org/release-group/${album.id}/front-500`;


  shuffleResult.innerHTML = `

    <div class="shuffle-pull">

      <div class="shuffle-pull-visual">

        <img
          src="assets/record-crate.png"
          class="shuffle-result-crate"
          alt=""
          aria-hidden="true"
        >

        <div class="shuffle-pulled-record">

          <img
            src="${coverURL}"
            alt="${escapeHTML(title)} by ${escapeHTML(artist)}"

            onerror="
              this.style.display='none';
              this.nextElementSibling.style.display='flex';
            "
          >

          <div
            class="shuffle-pulled-fallback"
            style="display:none;"
          >
            <span>RE:CORD</span>
          </div>

        </div>

      </div>


      <div class="shuffle-pull-info">

        <p class="shuffle-pull-label">
          YOUR RECORD
        </p>

        <p class="shuffle-pull-artist">
          ${escapeHTML(artist)}
        </p>

        <h3>
          ${escapeHTML(title)}
        </h3>

        <div class="shuffle-pull-meta">

          <span>
            ${escapeHTML(year)}
          </span>

          <span>
            ${escapeHTML(genre)}
          </span>

        </div>


        <div class="shuffle-discovery">

          <span>
            Discovered from
          </span>

          <strong>
            ${escapeHTML(decade.label)}
            ·
            ${escapeHTML(genre)}
          </strong>

        </div>


        <button
          class="album-card-link shuffle-record-link"
          data-id="${album.id}"
        >
          Explore record →
        </button>

      </div>

    </div>

  `;

}


/* =========================================
   RANDOM ITEM
========================================= */

function randomItem(
  array
) {

  return array[
    Math.floor(
      Math.random() *
      array.length
    )
  ];

}


/* =========================================
   SHUFFLE BUTTON
========================================= */

shuffleButton.addEventListener(
  "click",
  shuffleAlbum
);


/* =========================================
   SHUFFLE → ALBUM DETAIL
========================================= */

shuffleResult.addEventListener(
  "click",
  function(event) {

    const button =
      event.target.closest(
        ".shuffle-record-link"
      );


    if (!button) {

      return;

    }


    const releaseGroupId =
      button.dataset.id;


    document
      .getElementById("search")
      .scrollIntoView({
        behavior: "smooth"
      });


    openAlbum(
      releaseGroupId
    );

  }
);

/* =========================================
   ARTIST ALBUM SEARCH
========================================= */

async function searchArtistAlbums(
  artist
) {

  /*
    Instead of searching by artist name,
    use the artist's unique MusicBrainz ID.

    This prevents tribute artists and
    unrelated titles from entering the
    discography.
  */

  const query =
    `arid:${artist.id} AND ` +
    `primarytype:album AND ` +
    `status:official`;


  const url =
    "https://musicbrainz.org/ws/2/release-group/" +
    "?query=" +
    encodeURIComponent(query) +
    "&fmt=json" +
    "&limit=100";


  const response =
    await musicBrainzFetch(
      url
    );


  if (!response.ok) {

    throw new Error(
      `Artist album search failed: ${response.status}`
    );

  }


  const data =
    await response.json();


  let results =
    data["release-groups"] || [];


  /*
    Verify artist credit ourselves.
  */

  results =
    results.filter(
      (release) =>
        releaseHasArtist(
          release,
          artist.id
        )
    );


  /*
    Remove obvious non-standard albums
    from the default artist discography.
  */

  results =
    results.filter(
      (release) =>
        isStandardAlbum(
          release
        )
    );


  results =
    removeDuplicateReleaseGroups(
      results
    );


  /*
    Rank the discography.

    We prefer:
    - standard albums
    - established release groups
    - known release dates
  */

  results.sort(
    (a, b) => {

      const scoreA =
        scoreArtistAlbum(a);

      const scoreB =
        scoreArtistAlbum(b);


      if (
        scoreB !== scoreA
      ) {

        return (
          scoreB - scoreA
        );

      }


      return (
        getReleaseYear(a) -
        getReleaseYear(b)
      );

    }
  );


  return results.slice(
    0,
    12
  );

}


/* =========================================
   STANDARD ALBUM FILTER
========================================= */

function isStandardAlbum(
  release
) {

  if (
    release["primary-type"] !==
    "Album"
  ) {

    return false;

  }


  const secondaryTypes =
    release["secondary-types"] || [];


  const excludedTypes = [
    "Compilation",
    "DJ-mix",
    "Mixtape/Street",
    "Remix",
    "Live",
    "Soundtrack",
    "Demo",
    "Interview",
    "Spokenword",
    "Audiobook",
    "Audio drama",
    "Field recording"
  ];


  const hasExcludedType =
    secondaryTypes.some(
      (type) =>
        excludedTypes.includes(
          type
        )
    );


  return !hasExcludedType;

}


/* =========================================
   VERIFY ARTIST
========================================= */

function releaseHasArtist(
  release,
  artistId
) {

  const credits =
    release["artist-credit"] || [];


  return credits.some(
    (credit) =>
      credit.artist?.id ===
      artistId
  );

}


/* =========================================
   ARTIST ALBUM SCORE
========================================= */

function scoreArtistAlbum(
  release
) {

  let score = 0;


  /*
    MusicBrainz search relevance.
  */

  score +=
    Number(
      release.score || 0
    );


  /*
    Number of documented releases/editions.
  */

  const releaseCount =
    getReleaseCount(
      release
    );


  score +=
    Math.min(
      releaseCount * 8,
      160
    );


  /*
    Small preference for albums with
    known release dates.
  */

  if (
    release["first-release-date"]
  ) {

    score += 20;

  }


  return score;

}


/* =========================================
   ALBUM TITLE SEARCH
========================================= */

async function searchAlbums(
  query
) {

  /*
    Search the release-group title.

    Secondary types remain searchable because
    someone may intentionally search for a
    live album, remix, soundtrack, etc.
  */

  const albumQuery =
    `releasegroup:"${escapeLucene(query)}" ` +
    `AND primarytype:album ` +
    `AND status:official`;


  const url =
    "https://musicbrainz.org/ws/2/release-group/" +
    "?query=" +
    encodeURIComponent(
      albumQuery
    ) +
    "&fmt=json" +
    "&limit=50";


  const response =
    await musicBrainzFetch(
      url
    );


  if (!response.ok) {

    throw new Error(
      `Album search failed: ${response.status}`
    );

  }


  const data =
    await response.json();


  let results =
    data["release-groups"] || [];


  results =
    removeDuplicateReleaseGroups(
      results
    );


  const normalizedQuery =
    normalizeSearchText(
      query
    );


  results.sort(
    (a, b) => {

      const scoreA =
        scoreAlbumSearchResult(
          a,
          normalizedQuery
        );


      const scoreB =
        scoreAlbumSearchResult(
          b,
          normalizedQuery
        );


      return (
        scoreB - scoreA
      );

    }
  );


  return results.slice(
    0,
    12
  );

}


/* =========================================
   ALBUM SEARCH SCORE
========================================= */

function scoreAlbumSearchResult(
  release,
  query
) {

  let score = 0;


  const title =
    normalizeSearchText(
      release.title || ""
    );


  /*
    EXACT TITLE
  */

  if (
    title === query
  ) {

    score += 1000;

  }


  /*
    TITLE BEGINS WITH QUERY
  */

  else if (
    title.startsWith(query)
  ) {

    score += 600;

  }


  /*
    TITLE CONTAINS QUERY
  */

  else if (
    title.includes(query)
  ) {

    score += 300;

  }


  /*
    MusicBrainz relevance score.
  */

  score +=
    Number(
      release.score || 0
    ) * 2;


  /*
    Release count helps distinguish an
    established release group from an
    obscure album sharing the same title.
  */

  const releaseCount =
    getReleaseCount(
      release
    );


  score +=
    Math.min(
      releaseCount * 12,
      300
    );


  /*
    Penalize unusual secondary types
    slightly while keeping them searchable.
  */

  const secondaryTypes =
    release["secondary-types"] || [];


  const penalties = {
    "Compilation": 80,
    "Remix": 80,
    "Live": 60,
    "DJ-mix": 80,
    "Mixtape/Street": 60,
    "Soundtrack": 40,
    "Demo": 100
  };


  for (
    const type of secondaryTypes
  ) {

    score -=
      penalties[type] || 0;

  }


  /*
    Known release date gets a small boost.
  */

  if (
    release["first-release-date"]
  ) {

    score += 10;

  }


  return score;

}


/* =========================================
   RELEASE COUNT
========================================= */

function getReleaseCount(
  release
) {

  /*
    Depending on the MusicBrainz response,
    release information can appear as a
    count or collection.

    Handle both.
  */

  if (
    typeof release.releases ===
    "number"
  ) {

    return release.releases;

  }


  if (
    Array.isArray(
      release.releases
    )
  ) {

    return release.releases.length;

  }


  if (
    Number.isFinite(
      Number(
        release["release-count"]
      )
    )
  ) {

    return Number(
      release["release-count"]
    );

  }


  return 0;

}


/* =========================================
   REMOVE DUPLICATES
========================================= */

function removeDuplicateReleaseGroups(
  releases
) {

  const seen =
    new Set();


  return releases.filter(
    (release) => {

      if (
        !release.id ||
        seen.has(
          release.id
        )
      ) {

        return false;

      }


      seen.add(
        release.id
      );


      return true;

    }
  );

}


/* =========================================
   RELEASE YEAR
========================================= */

function getReleaseYear(
  release
) {

  const date =
    release["first-release-date"] ||
    release.date ||
    "";


  if (!date) {

    return 9999;

  }


  const year =
    parseInt(
      date.substring(
        0,
        4
      ),
      10
    );


  return Number.isNaN(
    year
  )
    ? 9999
    : year;

}


/* =========================================
   NORMALIZE TEXT
========================================= */

function normalizeSearchText(
  text
) {

  return String(text)

    .toLowerCase()

    .replace(
      /[^\p{L}\p{N}\s]/gu,
      ""
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();

}


/* =========================================
   ESCAPE LUCENE SEARCH
========================================= */

function escapeLucene(
  text
) {

  /*
    MusicBrainz search uses Lucene.

    Escape characters that have special
    meaning inside Lucene queries.
  */

  return String(text)
    .replace(
      /([+\-!(){}\[\]^"~*?:\\/]|&&|\|\|)/g,
      "\\$1"
    );

}


/* =========================================
   DISPLAY NO RESULTS
========================================= */

function displayNoResults(
  query
) {

  searchResults.innerHTML = `
    <p class="search-status">

      No records found for
      "<strong>${escapeHTML(query)}</strong>".

    </p>
  `;

}


/* =========================================
   DISPLAY SEARCH RESULTS
========================================= */

function displaySearchResults(
  results
) {

  const resultsHTML =
    results.map(
      (release) => {


        const title =
          release.title ||
          "Unknown Album";


        const artist =
          release["artist-credit"]?.[0]?.name ||
          "Unknown Artist";


        const date =
          release["first-release-date"] || "";


        const year =
          date
            ? date.substring(
                0,
                4
              )
            : "—";


        const type =
          release["primary-type"] ||
          "Album";


        const coverURL =
          `https://coverartarchive.org/release-group/${release.id}/front-500`;


        return `

          <article
            class="search-result-card"
            data-id="${release.id}"
          >


            <div class="search-result-artwork">

              <img
                src="${coverURL}"
                alt="${escapeHTML(title)} by ${escapeHTML(artist)}"
                loading="lazy"

                onerror="
                  this.style.display='none';
                  this.nextElementSibling.style.display='flex';
                "
              >


              <div class="cover-fallback">

                <span>
                  RE:CORD
                </span>

              </div>

            </div>


            <div class="search-result-info">

              <p class="search-result-artist">
                ${escapeHTML(artist)}
              </p>


              <h3>
                ${escapeHTML(title)}
              </h3>


              <div class="search-result-meta">

                <span>
                  ${escapeHTML(year)}
                </span>

                <span>
                  ${escapeHTML(type)}
                </span>

              </div>


              <button
                class="view-record-button"
                data-id="${release.id}"
              >
                Explore record →
              </button>

            </div>

          </article>

        `;

      }
    ).join("");


  searchResults.innerHTML = `

    <div class="search-results-header">

      <span>
        ${escapeHTML(
          currentSearchLabel
        )}
      </span>

      <span>
        ${results.length}
        ${results.length === 1
          ? "Record"
          : "Records"}
      </span>

    </div>


    <div class="search-results-grid">

      ${resultsHTML}

    </div>

  `;

}


/* =========================================
   SEARCH EVENTS
========================================= */

searchButton.addEventListener(
  "click",
  searchMusic
);


searchInput.addEventListener(
  "keydown",
  function(event) {

    if (
      event.key === "Enter"
    ) {

      searchMusic();

    }

  }
);


/* =========================================
   HTML SAFETY
========================================= */

function escapeHTML(
  value
) {

  return String(value)

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );

}


/* =========================================
   VIEW RECORD CLICK
========================================= */

searchResults.addEventListener(
  "click",
  function(event) {

    const button =
      event.target.closest(
        ".view-record-button"
      );


    if (!button) {

      return;

    }


    const releaseGroupId =
      button.dataset.id;


    openAlbum(
      releaseGroupId
    );

  }
);

/* =========================================
   SEARCH MUSIC
========================================= */

async function searchMusic() {

  const query =
    searchInput.value.trim();


  if (!query) {

    searchInput.focus();

    return;

  }


  setSearchLoading();


  try {

    /*
      First determine whether the user's
      query strongly matches an artist.
    */

    const artist =
      await findArtist(
        query
      );


    /*
      If we found a strong artist match,
      load that artist's studio albums.
    */

    if (artist) {

      const artistAlbums =
        await searchArtistAlbums(
          artist
        );


      if (
        artistAlbums.length > 0
      ) {

        currentSearchLabel =
          `Albums by ${artist.name}`;


        displaySearchResults(
          artistAlbums
        );


        return;

      }

    }


    /*
      If the query wasn't clearly an artist,
      or the artist search returned no albums,
      treat it as an album-title search.
    */

    const albumResults =
      await searchAlbums(
        query
      );


    if (
      albumResults.length === 0
    ) {

      displayNoResults(
        query
      );


      return;

    }


    currentSearchLabel =
      `Results for "${query}"`;


    displaySearchResults(
      albumResults
    );

  }

  catch (error) {

    console.error(
      "RE:CORD search error:",
      error
    );


    searchResults.innerHTML = `
      <p class="search-status search-error">
        RE:CORD couldn't reach the music database.
        Please try again.
      </p>
    `;

  }

  finally {

    searchButton.disabled =
      false;


    searchButton.textContent =
      "Search";

  }

}


/* =========================================
   SEARCH LOADING STATE
========================================= */

function setSearchLoading() {

  searchButton.disabled =
    true;


  searchButton.textContent =
    "Searching...";


  searchResults.innerHTML = `
    <p class="search-status">
      Searching the shelves...
    </p>
  `;

}


/* =========================================
   FIND ARTIST
========================================= */

async function findArtist(
  query
) {

  /*
    Search MusicBrainz's artist index first.

    If the user's query strongly matches an
    artist, we'll use the artist's unique
    MusicBrainz ID for the album search.
  */

  const artistQuery =
    `artist:"${escapeLucene(query)}"`;


  const url =
    "https://musicbrainz.org/ws/2/artist/" +
    "?query=" +
    encodeURIComponent(
      artistQuery
    ) +
    "&fmt=json" +
    "&limit=10";


  const response =
    await musicBrainzFetch(
      url
    );


  if (!response.ok) {

    throw new Error(
      `Artist search failed: ${response.status}`
    );

  }


  const data =
    await response.json();


  const artists =
    data.artists || [];


  if (
    artists.length === 0
  ) {

    return null;

  }


  const normalizedQuery =
    normalizeSearchText(
      query
    );


  /*
    Best case:
    exact normalized artist name.
  */

  const exactArtist =
    artists.find(
      (artist) =>
        normalizeSearchText(
          artist.name || ""
        ) === normalizedQuery
    );


  if (exactArtist) {

    return exactArtist;

  }


  /*
    Otherwise accept a very strong
    MusicBrainz result only when its name
    is also textually similar.

    This prevents album-title searches from
    accidentally being interpreted as an
    obscure artist.
  */

  const bestArtist =
    artists[0];


  if (!bestArtist) {

    return null;

  }


  const artistName =
    normalizeSearchText(
      bestArtist.name || ""
    );


  const musicBrainzScore =
    Number(
      bestArtist.score || 0
    );


  const similar =
    artistName.startsWith(
      normalizedQuery
    ) ||
    normalizedQuery.startsWith(
      artistName
    );


  if (
    musicBrainzScore >= 98 &&
    similar
  ) {

    return bestArtist;

  }


  return null;

}

/* =========================================
   ALBUM PAGE VIEW
========================================= */

function showAlbumPage() {

  const homeContent =
    document.getElementById("home-content");

  /*
    Keep the Search section available because
    it currently contains our dynamically
    generated album-detail container.

    Hide the homepage sections we don't need.
  */

  const homepageSections =
    homeContent.querySelectorAll(
      "#featured, #shuffle, #about"
    );

  homepageSections.forEach(
    (section) => {
      section.style.display = "none";
    }
  );


  /*
    Hide the search controls themselves while
    keeping #search and #search-results alive.
  */

  const discoverContent =
    document.querySelector(
      "#search .discover-content"
    );

  if (discoverContent) {
    discoverContent.classList.add(
      "album-view-active"
    );
  }


  /*
    Move the visitor to the beginning of the
    album view.
  */

  document
    .getElementById("search")
    .scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

}


function showHomePage() {

  const homeContent =
    document.getElementById("home-content");


  const homepageSections =
    homeContent.querySelectorAll(
      "#featured, #shuffle, #about"
    );


  homepageSections.forEach(
    (section) => {
      section.style.display = "";
    }
  );


  const discoverContent =
    document.querySelector(
      "#search .discover-content"
    );


  if (discoverContent) {
    discoverContent.classList.remove(
      "album-view-active"
    );
  }


  /*
    Return to Search because that's where the
    visitor originally selected the album.
  */

  document
    .getElementById("search")
    .scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

}

/* =========================================
   RESET HOMEPAGE
========================================= */

function resetHomePage() {

  /* Clear Search */

  searchInput.value = "";

  searchResults.innerHTML = "";

  currentSearchLabel =
    "Search Results";


  /* Reset Shuffle */

  previousShuffleId = null;

  shuffleResult.innerHTML = `
    <div class="shuffle-crate">

      <img
        src="assets/record-crate.png"
        class="shuffle-crate-image"
        alt="RE:CORD crate filled with vinyl records"
      >

    </div>
  `;


  /* Restore Shuffle button */

  shuffleButton.disabled = false;

  shuffleButton.innerHTML = `
    <span class="shuffle-icon">↝</span>
    Find an album
  `;

}

/* =========================================
   FEATURED NAV LINK
========================================= */

const featuredNavLink =
  document.getElementById(
    "featured-nav-link"
  );

if (featuredNavLink) {

  featuredNavLink.addEventListener(
    "click",
    function(event) {

      event.preventDefault();

      openAlbum(
        "48117b90-a16e-34ca-a514-19c702df1158"
      );

    }
  );

}

/* =========================================
   FEATURED CATALOGUE DATA
========================================= */

const featuredRecords = [

  {
    catalog: "001",
    number: "01",
    artist: "Daft Punk",
    title: "Discovery",
    year: "2001",

    description:
      "Explore Daft Punk's landmark second studio album and its critical reception across major music publications.",

    id:
      "48117b90-a16e-34ca-a514-19c702df1158"
  },


  {
    catalog: "002",
    number: "02",
    artist: "Bloc Party",
    title: "Silent Alarm",
    year: "2005",

    description:
      "Explore Bloc Party's explosive debut album, a defining record of the mid-2000s indie rock revival.",

    id:
      "f3f82b80-b2c5-3151-be53-5cb5803860e0"
  },


  {
    catalog: "003",
    number: "03",
    artist: "Arctic Monkeys",
    title: "AM",
    year: "2013",

    description:
      "Explore Arctic Monkeys' fifth studio album, blending indie rock, blues, psychedelia, and late-night grooves.",

    id:
      "a348ba2f-f8b3-4686-b928-e63d8d94d543"
    },


  {
    catalog: "004",
    number: "04",
    artist: "Queens of the Stone Age",
    title: "...Like Clockwork",
    year: "2013",

    description:
      "Explore Queens of the Stone Age's dark and atmospheric sixth studio album and its critical reception.",

    id:
      "c92f73ee-527f-42ed-a556-fd615941e214"
  },


  {
    catalog: "005",
    number: "05",
    artist: "cleopatrick",
    title: "BUMMER",
    year: "2021",

    description:
      "Explore cleopatrick's debut album, a raw and heavy modern rock record built around distorted guitars and stripped-back production.",

    id:
      "ec316a0f-fa23-4a2f-b934-e906d0ed3e75"
  }

];

/* =========================================
   PRELOAD FEATURED ALBUM COVERS
========================================= */

featuredRecords.forEach(
  function(record) {

    const image =
      new Image();

    image.src =
      `https://coverartarchive.org/release-group/${record.id}/front-1200`;

  }
);


/* =========================================
   FEATURED CATALOGUE DISPLAY
========================================= */

const featuredNumber =
  document.getElementById(
    "featured-number"
  );

const featuredCoverImage =
  document.getElementById(
    "featured-cover-image"
  );

const featuredStickerNumber =
  document.getElementById(
    "featured-sticker-number"
  );

const featuredArtist =
  document.getElementById(
    "featured-artist"
  );

const featuredTitle =
  document.getElementById(
    "featured-title"
  );

const featuredYear =
  document.getElementById(
    "featured-year"
  );

const featuredDescription =
  document.getElementById(
    "featured-description"
  );

const catalogueCurrent =
  document.getElementById(
    "catalogue-current"
  );

const featuredCatalogTabs =
  document.querySelectorAll(
    ".featured-catalog-tab"
  );


let currentFeaturedIndex = 0;


/* =========================================
   DISPLAY FEATURED RECORD
========================================= */

function displayFeaturedRecord(index) {

  const featuredSection =
    document.getElementById(
      "featured"
    );

  const record =
    featuredRecords[index];

  if (!record) {
    return;
  }


  /* Fade out current record */

  featuredSection.classList.add(
    "featured-record-changing"
  );


  /*
    Wait for the fade-out before
    replacing the record information.
  */

  setTimeout(
    function() {


      currentFeaturedIndex =
        index;


      /* Main catalogue number */

      featuredNumber.textContent =
        record.number;


      /* Album cover */

      featuredCoverImage.src =
        `https://coverartarchive.org/release-group/${record.id}/front-1200`;

      featuredCoverImage.alt =
        `${record.title} by ${record.artist}`;


      /* Sticker */

      featuredStickerNumber.textContent =
        record.catalog;


      /* Album information */

      featuredArtist.textContent =
        record.artist;

      featuredTitle.textContent =
        record.title;

      featuredYear.textContent =
        record.year;

      featuredDescription.textContent =
        record.description;


      /* Bottom 01 / 05 counter */

      catalogueCurrent.textContent =
        record.number;


      /* Update Explore Album */

      featuredAlbumLink.dataset.id =
        record.id;


      /* Update active catalogue tab */

      featuredCatalogTabs.forEach(
        (tab, tabIndex) => {

          const active =
            tabIndex === index;

          tab.classList.toggle(
            "active",
            active
          );

          tab.setAttribute(
            "aria-selected",
            active
              ? "true"
              : "false"
          );

        }
      );


      /* Fade new record back in */

      featuredSection.classList.remove(
        "featured-record-changing"
      );


    },
    220
  );

}


/* =========================================
   FEATURED CATALOGUE TABS
========================================= */

featuredCatalogTabs.forEach(
  (tab) => {

    tab.addEventListener(
      "click",
      function() {

        const index =
          Number(
            tab.dataset.index
          );

        displayFeaturedRecord(
          index
        );

      }
    );

  }
);

/* =========================================
   FEATURED PREVIOUS / NEXT
========================================= */

const featuredPrevious =
  document.getElementById(
    "featured-previous"
  );

const featuredNext =
  document.getElementById(
    "featured-next"
  );


/* Previous record */

featuredPrevious.addEventListener(
  "click",
  function() {

    let previousIndex =
      currentFeaturedIndex - 1;


    /*
      Wrap from the first record
      back to the last record.
    */

    if (previousIndex < 0) {

      previousIndex =
        featuredRecords.length - 1;

    }


    displayFeaturedRecord(
      previousIndex
    );

  }
);


/* Next record */

featuredNext.addEventListener(
  "click",
  function() {

    let nextIndex =
      currentFeaturedIndex + 1;


    /*
      Wrap from the last record
      back to the first record.
    */

    if (
      nextIndex >=
      featuredRecords.length
    ) {

      nextIndex = 0;

    }


    displayFeaturedRecord(
      nextIndex
    );

  }
);

/* =========================================
   FEATURED ALBUM
========================================= */

const featuredAlbumLink =
  document.querySelector(
    ".featured-album-link"
  );

if (featuredAlbumLink) {

  featuredAlbumLink.addEventListener(
    "click",
    function() {

      const releaseGroupId =
        featuredAlbumLink.dataset.id;

      openAlbum(
        releaseGroupId
      );

    }
  );

}

/* =========================================
   OPEN ALBUM
========================================= */

async function openAlbum(
  releaseGroupId
) {

  showAlbumPage();


  searchResults.innerHTML = `
    <p class="search-status">
      Pulling record from the shelf...
    </p>
  `;


  try {

    /* -----------------------------------------
       STEP 1
       FETCH RELEASE GROUP
    ----------------------------------------- */

    const groupURL =
      `https://musicbrainz.org/ws/2/release-group/${releaseGroupId}` +
      `?inc=artist-credits+releases+genres+url-rels&fmt=json`;


    const groupResponse =
      await musicBrainzFetch(
        groupURL
      );


    if (
      !groupResponse.ok
    ) {

      throw new Error(
        `Release group request failed: ${groupResponse.status}`
      );

    }


    const group =
      await groupResponse.json();


    const releases =
      group.releases || [];


    if (
      releases.length === 0
    ) {

      throw new Error(
        "No releases were found for this album."
      );

    }


    /* -----------------------------------------
       STEP 2
       CHOOSE BEST EDITION
    ----------------------------------------- */

    const selectedRelease =
      selectBestRelease(
        releases,
        group
      );


    if (
      !selectedRelease ||
      !selectedRelease.id
    ) {

      throw new Error(
        "No usable release edition was found."
      );

    }


    /* -----------------------------------------
       STEP 3
       FETCH TRACK LIST
    ----------------------------------------- */

    const releaseURL =
      `https://musicbrainz.org/ws/2/release/${selectedRelease.id}` +
      `?inc=recordings+artist-credits+release-groups&fmt=json`;


    const releaseResponse =
      await musicBrainzFetch(
        releaseURL
      );


    if (
      !releaseResponse.ok
    ) {

      throw new Error(
        `Release request failed: ${releaseResponse.status}`
      );

    }


    const release =
      await releaseResponse.json();


    /* -----------------------------------------
       STEP 4
       DISPLAY RECORD
    ----------------------------------------- */

    displayAlbumDetail(
      group,
      release
    );

  }

  catch (error) {

    console.error(
      "RE:CORD album error:",
      error
    );


    searchResults.innerHTML = `

      <div class="album-error">

        <p>
          RE:CORD couldn't load this record.
        </p>

        <button
          class="back-to-search"
          id="album-error-back"
        >
          ← Back to discovery
        </button>

      </div>

    `;


    document
  .getElementById(
    "album-error-back"
  )
  .addEventListener(
    "click",
    function() {

      showHomePage();

    }
  );

}


/* =========================================
   SELECT BEST RELEASE
========================================= */

function selectBestRelease(
  releases,
  group
) {

  const groupYear =
    getReleaseYear(
      group
    );


  const scored =
    releases.map(
      (release) => {

        let score = 0;


        /*
          Prefer official releases.
        */

        if (
          release.status ===
          "Official"
        ) {

          score += 1000;

        }


        /*
          Prefer an edition released in the
          album's original year.
        */

        const releaseYear =
          release.date
            ? parseInt(
                release.date.substring(
                  0,
                  4
                ),
                10
              )
            : null;


        if (
          releaseYear &&
          groupYear !== 9999 &&
          releaseYear === groupYear
        ) {

          score += 500;

        }


        /*
          Penalize much later reissues.
        */

        if (
          releaseYear &&
          groupYear !== 9999 &&
          releaseYear > groupYear
        ) {

          score -=
            Math.min(
              (
                releaseYear -
                groupYear
              ) * 10,
              300
            );

        }


        return {
          release,
          score
        };

      }
    );


  scored.sort(
    (a, b) =>
      b.score - a.score
  );


  return (
    scored[0]?.release ||
    releases[0]
  );

}

/* =========================================
   CRITICAL RECEPTION
========================================= */

/*
  Professional reviews are curated separately
  from MusicBrainz album metadata.

  Each entry uses the MusicBrainz release-group
  ID as its key.
*/

/* =========================================
   BUILD CRITICAL RECEPTION
========================================= */

function buildCriticalReception(
  releaseGroupId
) {

  const reviews =
    criticalReviews[
      releaseGroupId
    ] || [];


  /*
    CURATED RE:CORD REVIEWS

    Discovery, Silent Alarm, and AM
    currently use this archive.
  */

  if (
    reviews.length > 0
  ) {

    const reviewHTML =
      reviews.map(
        (review) => `

          <article class="critic-review">

            <div class="critic-review-header">

              <span class="critic-publication">
                ${escapeHTML(
                  review.publication
                )}
              </span>

              <span class="critic-score">
                ${escapeHTML(
                  review.score
                )}
              </span>

            </div>


            <p class="critic-summary">
              ${escapeHTML(
                review.summary
              )}
            </p>


            <a
              class="critic-link"
              href="${review.url}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read review →
            </a>

          </article>

        `
      ).join("");


    return `

      <section class="critical-reception">

        <div class="critical-heading">

          <span class="critical-kicker">
            RE:CORD Archive
          </span>

          <h3>
            Critical Reception
          </h3>

        </div>

        ${reviewHTML}

      </section>

    `;

  }


  /*
    NO CURATED REVIEW

    Create a loading area for CritiqueBrainz.
  */

  return `

    <section
      class="critical-reception"
      id="critical-reception-${releaseGroupId}"
    >

      <div class="critical-heading">

        <span class="critical-kicker">
          RE:CORD Archive
        </span>

        <h3>
          Critical Reception
        </h3>

      </div>


      <div class="critical-empty">

        <p>
          Checking the review archive...
        </p>

      </div>

    </section>

  `;

}

/* =========================================
   LOAD ALBUM RECEPTION
========================================= */

async function loadCritiqueBrainzReviews(
  releaseGroupId,
  relations = []
) {

  /*
    1. Curated RE:CORD reviews always win.
  */

  if (
    criticalReviews[
      releaseGroupId
    ]?.length
  ) {

    return;

  }


  const container =
    document.getElementById(
      `critical-reception-${releaseGroupId}`
    );


  if (!container) {

    return;

  }


  /*
    2. Check MusicBrainz for explicitly
       classified professional review links.
  */

  const professionalReviews =
    relations.filter(
      (relation) =>
        relation.type === "review" &&
        relation.url?.resource
    );


  if (
    professionalReviews.length > 0
  ) {

    displayMusicBrainzReviewLinks(
      container,
      professionalReviews
    );

    return;

  }


  /*
    Save an AllMusic relationship in case
    neither professional review links nor
    CritiqueBrainz reviews are available.
  */

  const allMusicRelation =
    relations.find(
      (relation) =>
        relation.type === "allmusic" &&
        relation.url?.resource
    );


  /*
    3. No professional review relationship.
       Try CritiqueBrainz community reviews.
  */

  try {

    const url =
      "https://critiquebrainz.org/ws/1/review/" +
      "?entity_type=release_group" +
      "&entity_id=" +
      encodeURIComponent(
        releaseGroupId
      ) +
      "&limit=3";


    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        `CritiqueBrainz request failed: ${response.status}`
      );

    }


    const data =
      await response.json();


    const reviews =
      data.reviews || [];


    if (
      reviews.length > 0
    ) {

      displayCritiqueBrainzReviews(
        container,
        reviews
      );

      return;

    }

  }

  catch (error) {

    console.warn(
      "RE:CORD CritiqueBrainz error:",
      error
    );

  }


  /*
    4. CritiqueBrainz also had nothing.
       Fall back to AllMusic when available.
  */

  if (allMusicRelation) {

    displayAllMusicLink(
      container,
      allMusicRelation.url.resource
    );

    return;

  }


  /*
    5. Nothing was found anywhere.
  */

  displayNoCritiqueBrainzReviews(
    container
  );

}

/* =========================================
   DISPLAY CRITIQUEBRAINZ REVIEWS
========================================= */

function displayCritiqueBrainzReviews(
  container,
  reviews
) {

  const reviewHTML =
    reviews.map(
      (review) => {

        const reviewer =
          review.user?.display_name ||
          review.user?.username ||
          "CritiqueBrainz User";


        const rating =
          review.rating
            ? `${review.rating} / 5`
            : "Review";


        const text =
          review.text ||
          "No written review available.";


        const reviewURL =
          review.id
            ? `https://critiquebrainz.org/review/${review.id}`
            : "https://critiquebrainz.org/";


        return `

          <article class="critic-review">

            <div class="critic-review-header">

              <span class="critic-publication">
                ${escapeHTML(reviewer)}
              </span>

              <span class="critic-score">
                ${escapeHTML(rating)}
              </span>

            </div>


            <p class="critic-summary">
              ${escapeHTML(text)}
            </p>


            <a
              class="critic-link"
              href="${reviewURL}"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on CritiqueBrainz →
            </a>

          </article>

        `;

      }
    ).join("");


  container.innerHTML = `

    <div class="critical-heading">

      <span class="critical-kicker">
        CritiqueBrainz
      </span>

      <h3>
        Community Reception
      </h3>

    </div>

    ${reviewHTML}

  `;

}

/* =========================================
   MUSICBRAINZ PROFESSIONAL REVIEWS
========================================= */

function displayMusicBrainzReviewLinks(
  container,
  reviewRelations
) {

  const reviewHTML =
    reviewRelations.map(
      (relation) => {

        const url =
          relation.url.resource;


        let publication =
          "External Review";


        try {

          const hostname =
            new URL(url)
              .hostname
              .replace(
                /^www\./,
                ""
              );


          if (
            hostname.includes(
              "metacritic.com"
            )
          ) {

            publication =
              "Metacritic";

          }

          else if (
            hostname.includes(
              "pitchfork.com"
            )
          ) {

            publication =
              "Pitchfork";

          }

          else if (
            hostname.includes(
              "allmusic.com"
            )
          ) {

            publication =
              "AllMusic";

          }

          else if (
            hostname.includes(
              "nme.com"
            )
          ) {

            publication =
              "NME";

          }

          else if (
            hostname.includes(
              "rollingstone.com"
            )
          ) {

            publication =
              "Rolling Stone";

          }

          else if (
            hostname.includes(
              "bbc.co.uk"
            ) ||
            hostname.includes(
              "bbc.com"
            )
          ) {

            publication =
              "BBC";

          }

          else {

            publication =
              hostname;

          }

        }

        catch (error) {

          console.warn(
            "RE:CORD couldn't identify review source:",
            url
          );

        }


        return `

          <article class="critic-review">

            <div class="critic-review-header">

              <span class="critic-publication">
                ${escapeHTML(
                  publication
                )}
              </span>

              <span class="critic-score">
                Review
              </span>

            </div>


            <p class="critic-summary">
              Professional review linked through
              the MusicBrainz archive.
            </p>


            <a
              class="critic-link"
              href="${escapeHTML(url)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read review →
            </a>

          </article>

        `;

      }
    ).join("");


  container.innerHTML = `

    <div class="critical-heading">

      <span class="critical-kicker">
        RE:CORD Archive
      </span>

      <h3>
        Critical Reception
      </h3>

    </div>

    ${reviewHTML}

  `;

}

/* =========================================
   ALLMUSIC FALLBACK
========================================= */

function displayAllMusicLink(
  container,
  url
) {

  container.innerHTML = `

    <div class="critical-heading">

      <span class="critical-kicker">
        RE:CORD Archive
      </span>

      <h3>
        Critical Reception
      </h3>

    </div>


    <article class="critic-review">

      <div class="critic-review-header">

        <span class="critic-publication">
          AllMusic
        </span>

        <span class="critic-score">
          Album Page
        </span>

      </div>


      <p class="critic-summary">
        Explore album information and available
        critical coverage on AllMusic.
      </p>


      <a
        class="critic-link"
        href="${escapeHTML(url)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        View on AllMusic →
      </a>

    </article>

  `;

}

/* =========================================
   NO CRITIQUEBRAINZ REVIEWS
========================================= */

function displayNoCritiqueBrainzReviews(
  container
) {

  container.innerHTML = `

    <div class="critical-heading">

      <span class="critical-kicker">
        RE:CORD Archive
      </span>

      <h3>
        Critical Reception
      </h3>

    </div>


    <div class="critical-empty">

      <p>
        No reviews were found for this record.
      </p>

    </div>

  `;

}

/* =========================================
   DISPLAY ALBUM DETAIL
========================================= */

function displayAlbumDetail(
  group,
  release
) {

    console.log(
        "RE:CORD release group:",
        group.title,
        group.id
    );
    
  const title =
    group.title ||
    "Unknown Album";


  const artist =
    group["artist-credit"]?.[0]?.name ||
    "Unknown Artist";


  const releaseDate =
    group["first-release-date"] || "";


  const year =
    releaseDate
      ? releaseDate.substring(
          0,
          4
        )
      : "—";


  const coverURL =
    `https://coverartarchive.org/release-group/${group.id}/front-1200`;

    /* -----------------------------------------
   LISTENING LINKS
----------------------------------------- */

const listenQuery =
  encodeURIComponent(
    `${artist} ${title}`
  );


const spotifyURL =
  `https://open.spotify.com/search/${listenQuery}`;


const appleMusicURL =
  `https://music.apple.com/us/search?term=${listenQuery}`;


const youtubeMusicURL =
  `https://music.youtube.com/search?q=${listenQuery}`;

  /* -----------------------------------------
     GENRES
  ----------------------------------------- */

  const genres =
    (group.genres || [])

      .sort(
        (a, b) =>
          (b.count || 0) -
          (a.count || 0)
      )

      .slice(
        0,
        3
      )

      .map(
        (genre) =>
          genre.name
      );


  const genreText =
    genres.length > 0
      ? genres.join(" / ")
      : "Album";


  /* -----------------------------------------
     TRACKS
  ----------------------------------------- */

  const tracks =
    (release.media || [])

      .flatMap(
        (medium) =>
          medium.tracks || []
      );


  /* -----------------------------------------
     BUILD TRACK LIST
  ----------------------------------------- */

  const trackHTML =
    tracks.length > 0

      ? tracks.map(
          (track, index) => {


            const trackTitle =
              track.title ||
              track.recording?.title ||
              "Unknown Track";


            const trackNumber =
              String(
                index + 1
              ).padStart(
                2,
                "0"
              );


            const duration =
              formatTrackLength(
                track.length
              );


            return `

              <li class="track">

                <span class="track-number">
                  ${trackNumber}
                </span>


                <span class="track-title">
                  ${escapeHTML(trackTitle)}
                </span>


                <span class="track-duration">
                  ${duration}
                </span>

              </li>

            `;

          }
        ).join("")

      : `

          <li class="track track-unavailable">
            Track listing unavailable.
          </li>

        `;


  /* -----------------------------------------
     BUILD ALBUM PAGE
  ----------------------------------------- */

  searchResults.innerHTML = `

    <div class="album-detail">


      <button
        class="back-to-results"
        id="back-to-results"
      >
        ← Back to discovery
      </button>


      <div class="album-detail-layout">


        <div class="album-detail-left">

  <div class="album-detail-artwork">

    <img
      src="${coverURL}"
      alt="${escapeHTML(title)} by ${escapeHTML(artist)}"

      onerror="
        this.style.display='none';
        this.nextElementSibling.style.display='flex';
      "
    >

    <div class="album-detail-fallback">

      <span>
        RE:CORD
      </span>

    </div>

  </div>


  ${buildCriticalReception(
    group.id
  )}


</div>


<div class="album-detail-content">


          <p class="album-detail-artist">

            ${escapeHTML(artist)}

          </p>


          <h2>

            ${escapeHTML(title)}

          </h2>


          <div class="album-detail-meta">

            <span>
              ${escapeHTML(year)}
            </span>

            <span>
              ${escapeHTML(genreText)}
            </span>

            <span>
              ${tracks.length} Tracks
            </span>

          </div>

          <!-- LISTEN -->

        <div class="album-listen">

            <span class="album-listen-label">
            Listen
            </span>

           <div class="album-listen-links">

  <a
    href="${spotifyURL}"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Listen on Spotify"
    title="Spotify"
  >
    <img
      src="assets/spotify.svg"
      alt=""
      class="listen-icon listen-icon-default"
    >

    <img
      src="assets/spotify-color.svg"
      alt=""
      class="listen-icon listen-icon-color"
    >
  </a>


  <a
    href="${appleMusicURL}"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Listen on Apple Music"
    title="Apple Music"
  >
    <img
      src="assets/apple-music.svg"
      alt=""
      class="listen-icon listen-icon-default"
    >

    <img
      src="assets/apple-music-color.svg"
      alt=""
      class="listen-icon listen-icon-color"
    >
  </a>


  <a
    href="${youtubeMusicURL}"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Listen on YouTube Music"
    title="YouTube Music"
  >
    <img
      src="assets/youtube-music.svg"
      alt=""
      class="listen-icon listen-icon-default"
    >

    <img
      src="assets/youtube-music-color.svg"
      alt=""
      class="listen-icon listen-icon-color"
    >
  </a>

</div>

        </div>


          <div class="tracklist">


            <div class="tracklist-header">

              <span>
                Track
              </span>

              <span>
                ${escapeHTML(
                  release.title ||
                  title
                )}
              </span>

            </div>


            <ol class="tracks">

              ${trackHTML}

            </ol>

          </div>

        </div>

      </div>

    </div>

  `;

  /*
  Load CritiqueBrainz after the album
  page has been inserted into the DOM.
*/

loadCritiqueBrainzReviews(
  group.id,
  group.relations || []
);


  document
  .getElementById(
    "back-to-results"
  )
  .addEventListener(
    "click",
    function() {

      resetHomePage();

      showHomePage();

    }
  );


  document
    .getElementById(
      "search"
    )
    .scrollIntoView({
      behavior: "smooth"
    });

}


/* =========================================
   TRACK LENGTH
========================================= */

function formatTrackLength(
  milliseconds
) {

  if (!milliseconds) {

    return "—";

  }


  const totalSeconds =
    Math.floor(
      milliseconds / 1000
    );


  const minutes =
    Math.floor(
      totalSeconds / 60
    );


  const seconds =
    totalSeconds % 60;


  return (
    `${minutes}:` +
    `${String(seconds).padStart(2, "0")}`
  );

    }
}
