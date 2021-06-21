# cloudflare-workers
A collection of Cloudflare worker scripts

* **map-tile-cache:** Make requests to map tile services with heavy caching.
* **on-the-ground:** Combine a response from Mapbox's reverse geocoding and tilequery APIs for a given coordinate in to one response. Includes a simple mode to reduce the data returned.
* **profile-image-lite:** Add an image from unsplash.com to a fixed foreground image. Returns the HCTI URL, uses env. variables to disallow deletion, cache clearing.
* **profile-image:** Add an image from unsplash.com to a fixed foreground image. Returns image data by making a request to HCTI.
* **trigger-netlify-build:** Trigger a Netlify build hook via a GET request. Allows you to change the trigger title.
