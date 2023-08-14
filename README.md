# cloudflare-workers
A collection of Cloudflare worker scripts

* **g11n:** Globalize strings a website by replacing strings based on a visitors country code.
* **gh_projects:** Cache and return a copy of information about a users public GitHib repositories that also includes the 5 most recent tags, contributor counts, subscriber counts, and successful deployments that have a URL.
* **map-tile-cache:** Make requests to map tile services with heavy caching.
* **on-the-ground:** Combine a response from Mapbox's reverse geocoding and tilequery APIs for a given coordinate in to one response. Includes a simple mode to reduce the data returned.
* **profile-image:** Add an image from unsplash.com to a fixed foreground image. Returns the HCTI URL, uses env. variables to disallow deletion, cache clearing.
* **serve-string:** A worker designed to return short text, emoji for multiple domains, addresses, paths.
* **trigger-netlify-build:** Trigger a Netlify build hook via a GET request. Allows you to change the trigger title.
